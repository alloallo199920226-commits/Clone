"""24-hour account credits, atomic with purchase receipts and safe across workers.

No public settlement endpoint, payment-provider request, startup DDL, or client clock.
The first persisted activation excludes all preceding periods for existing purchases.
"""
from datetime import timedelta, timezone
import logging
import threading

from psycopg.types.json import Jsonb

import auth_backend as db

DAY = timedelta(hours=24)
INTERVAL_SECONDS = 30
MAX_PERIODS_PER_PASS = 100
_thread = None
_thread_lock = threading.Lock()


def activation(cursor):
    cursor.execute("INSERT INTO shineray_income_policy(id) VALUES (1) ON CONFLICT DO NOTHING")
    cursor.execute("SELECT activated_at FROM shineray_income_policy WHERE id=1")
    return cursor.fetchone()["activated_at"].astimezone(timezone.utc)


def enroll(cursor, purchase, product, activated_at):
    """Caller holds the account lock. Snapshot terms once; never reprice a schedule."""
    details = purchase["details"]
    daily = details.get("daily_income_fcfa", product.get("dailyIncome"))
    days = details.get("validity_days", product.get("durationDays"))
    total = details.get("total_income_fcfa", product.get("totalIncome"))
    earned = details.get("income_fcfa", 0)
    if not (type(daily) is int and 1 <= daily <= db.MAX_ACTIVITY_AMOUNT
            and type(days) is int and 1 <= days <= 3650
            and type(total) is int and daily <= total <= 1_825_000_000_000
            and type(earned) is int and 0 <= earned <= total):
        raise ValueError("Conditions de revenu du produit absentes ou invalides.")
    purchased_at = purchase["created_at"].astimezone(timezone.utc)
    starts = max(purchased_at, activated_at)
    expires = purchased_at + days * DAY
    next_due = starts + DAY
    if next_due > expires or earned >= total:
        next_due = None
    cursor.execute("""INSERT INTO shineray_product_income
        (purchase_id,user_id,starts_at,expires_at,daily_fcfa,total_fcfa,earned_fcfa,next_due_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (purchase_id) DO NOTHING
        RETURNING purchase_id""",
                   (purchase["id"], purchase["user_id"], starts, expires, daily, total, earned, next_due))
    if cursor.fetchone():
        cursor.execute("""UPDATE shineray_transactions SET details=details || %s WHERE id=%s""",
                       (Jsonb({"daily_income_fcfa": daily, "total_income_fcfa": total,
                               "income_fcfa": earned, "automatic_income_enabled": True}),
                        purchase["id"]))


def settle_user(user_id, now=None):
    """An optional server-side time is for deterministic tests only."""
    import vip_purchases

    with db.connect() as conn, conn.cursor() as cursor:
        # All balance writers use this lock first, including purchases/withdrawals.
        cursor.execute("""SELECT is_banned,is_blocked FROM shineray_users
            WHERE id=%s FOR NO KEY UPDATE""", (user_id,))
        user = cursor.fetchone()
        if not user or user["is_banned"] or user["is_blocked"]:
            return 0
        activated_at = activation(cursor)
        cursor.execute("SELECT clock_timestamp() AS now")
        current = (now or cursor.fetchone()["now"]).astimezone(timezone.utc)
        cursor.execute("""SELECT t.* FROM shineray_transactions t
            LEFT JOIN shineray_product_income i ON i.purchase_id=t.id
            WHERE t.user_id=%s AND t.kind='purchase' AND t.amount_fcfa<0
                AND i.purchase_id IS NULL ORDER BY t.id""", (user_id,))
        purchases = cursor.fetchall()
        products = vip_purchases.catalog(cursor) if purchases else {}
        for purchase in purchases:
            code = purchase["details"].get("product_code") or purchase["label"]
            if code not in products:
                logging.warning("Revenus non configurés pour l'achat %s.", purchase["id"])
                continue
            try:
                enroll(cursor, purchase, products[code], activated_at)
            except ValueError:
                logging.warning("Conditions de revenu invalides pour l'achat %s.", purchase["id"])
        cursor.execute("""SELECT * FROM shineray_product_income
            WHERE user_id=%s AND next_due_at<=%s ORDER BY purchase_id FOR UPDATE""",
                       (user_id, current))
        paid = 0
        for schedule in cursor.fetchall():
            periods = schedule["paid_periods"]
            earned = schedule["earned_fcfa"]
            due = schedule["next_due_at"]
            for _ in range(MAX_PERIODS_PER_PASS):
                if due is None or due > current:
                    break
                amount = min(schedule["daily_fcfa"], schedule["total_fcfa"] - earned)
                reference = f"product-income:{schedule['purchase_id']}:{periods + 1}"
                # The unique reference is a second barrier in addition to account/schedule locks.
                # Any inconsistency aborts the whole transaction instead of skipping money.
                cursor.execute("""INSERT INTO shineray_transactions
                    (user_id,kind,label,amount_fcfa,provider_reference,details)
                    VALUES (%s,'income','Revenu quotidien du produit',%s,%s,%s)""",
                               (user_id, amount, reference, Jsonb({
                                   "purchase_id": schedule["purchase_id"], "period": periods + 1,
                                   "due_at": due.isoformat(), "source": "product_income",
                               })))
                earned += amount
                periods += 1
                paid += 1
                due = schedule["starts_at"] + (periods + 1) * DAY
                if due > schedule["expires_at"] or earned >= schedule["total_fcfa"]:
                    due = None
            cursor.execute("""UPDATE shineray_product_income
                SET paid_periods=%s,earned_fcfa=%s,next_due_at=%s WHERE purchase_id=%s""",
                           (periods, earned, due, schedule["purchase_id"]))
            cursor.execute("""UPDATE shineray_transactions SET details=details || %s WHERE id=%s""",
                           (Jsonb({"income_fcfa": earned}), schedule["purchase_id"]))
        return paid


def run_once():
    """Keyset batches avoid starving later accounts; each account commits separately."""
    with db.connect() as conn, conn.cursor() as cursor:
        activation(cursor)
    last = 0
    paid = 0
    while True:
        with db.connect() as conn, conn.cursor() as cursor:
            cursor.execute("""SELECT candidate.user_id FROM (
                SELECT user_id FROM shineray_product_income WHERE next_due_at<=now()
                UNION
                SELECT t.user_id FROM shineray_transactions t
                LEFT JOIN shineray_product_income i ON i.purchase_id=t.id
                WHERE t.kind='purchase' AND t.amount_fcfa<0 AND i.purchase_id IS NULL
                ) candidate JOIN shineray_users u ON u.id=candidate.user_id
                WHERE candidate.user_id>%s AND NOT u.is_banned AND NOT u.is_blocked
                ORDER BY candidate.user_id LIMIT 200""", (last,))
            users = [row["user_id"] for row in cursor.fetchall()]
        if not users:
            return paid
        for user_id in users:
            try:
                paid += settle_user(user_id)
            except Exception:
                # No credentials, OTP, phone, or provider payload is logged.
                logging.exception("Versement des revenus différé pour le compte %s.", user_id)
        last = users[-1]


def start():
    global _thread
    with _thread_lock:
        if _thread is not None and _thread.is_alive():
            return

        def run():
            while True:
                try:
                    run_once()
                except Exception:
                    logging.exception("Service de revenus temporairement indisponible.")
                threading.Event().wait(INTERVAL_SECONDS)

        _thread = threading.Thread(target=run, name="product-income", daemon=True)
        _thread.start()
