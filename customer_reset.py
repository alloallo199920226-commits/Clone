"""Explicit owner-only customer deletion; no schema or settings changes."""
import base64
import hashlib
import hmac
import json
import secrets
import time

import auth_backend as db

CONFIRMATION = "SUPPRIMER LES UTILISATEURS"
EXPIRY_SECONDS = 300
# Fixed allowlist, also used to block concurrent financial/account writes.
TABLES = (
    "shineray_users", "shineray_sessions", "shineray_admin_sessions",
    "shineray_admin_login_attempts", "shineray_demo_activity",
    "shineray_wallets", "shineray_transactions", "shineray_deposit_approvals",
    "shineray_first_deposits", "shineray_manual_deposits",
    "shineray_admin_operations", "shineray_admin_audit",
    "shineray_admin_vip_grants", "shineray_sonarapay_orders",
    "shineray_product_income", "shineray_gift_redemptions",
    "shineray_withdrawal_requests",
)


def _signature(payload, key):
    return hmac.new(key, b"customer-reset-v1:" + payload.encode(), hashlib.sha256).hexdigest()


def preview(cur, key):
    cur.execute("SELECT COALESCE(max(id),0) cutoff FROM shineray_users")
    cutoff = cur.fetchone()["cutoff"]
    cur.execute("""SELECT
        (SELECT count(*) FROM shineray_users WHERE NOT is_admin AND id<=%s) customer_count,
        (SELECT count(*) FROM shineray_transactions t JOIN shineray_users u
            ON u.id=t.user_id WHERE NOT u.is_admin AND u.id<=%s) activity_count,
        (SELECT count(*) FROM shineray_withdrawal_requests w JOIN shineray_users u
            ON u.id=w.user_id WHERE NOT u.is_admin AND u.id<=%s
            AND w.status='pending') pending_withdrawals,
        ((SELECT count(*) FROM shineray_manual_deposits m JOIN shineray_users u
            ON u.id=m.user_id WHERE NOT u.is_admin AND u.id<=%s
            AND m.status='pending') +
         (SELECT count(*) FROM shineray_sonarapay_orders s JOIN shineray_users u
            ON u.id=s.user_id WHERE NOT u.is_admin AND u.id<=%s
            AND s.status NOT IN ('successful','failed'))) pending_deposits""", (cutoff,) * 5)
    counts = dict(cur.fetchone())
    payload = base64.urlsafe_b64encode(json.dumps({
        "cutoff": cutoff, "expires": int(time.time()) + EXPIRY_SECONDS,
        "nonce": secrets.token_hex(16),
    }, separators=(",", ":")).encode()).decode()
    return {**counts, "preview_token": payload + "." + _signature(payload, key),
            "expires_in": EXPIRY_SECONDS}


def execute(cur, body, key, audit):
    if set(body) != {"preview_token", "password", "confirmation", "backup_confirmed"}:
        raise ValueError("Champs de confirmation invalides.")
    if body["confirmation"] != CONFIRMATION or body["backup_confirmed"] is not True:
        raise ValueError("Confirmez la sauvegarde et saisissez la phrase de suppression exacte.")
    token = body["preview_token"]
    try:
        if not isinstance(token, str) or len(token) > 1024:
            raise ValueError()
        payload, signature = token.split(".")
        if not hmac.compare_digest(_signature(payload, key), signature):
            raise ValueError()
        snapshot = json.loads(base64.urlsafe_b64decode(payload))
        if (set(snapshot) != {"cutoff", "expires", "nonce"}
                or type(snapshot["cutoff"]) is not int or snapshot["cutoff"] < 0
                or type(snapshot["expires"]) is not int):
            raise ValueError()
    except (ValueError, TypeError, KeyError):
        raise ValueError("Aperçu de suppression invalide. Rechargez l’aperçu.") from None
    receipt = hashlib.sha256(token.encode()).hexdigest()
    # Serialize concurrent resets/retries across replicas before checking receipts.
    cur.execute("SELECT pg_advisory_xact_lock(hashtextextended('customer-reset',0))")
    cur.execute("""SELECT details FROM shineray_admin_audit
        WHERE event_type='customer_reset'
        AND details->>'reset_token_hash'=%s ORDER BY id DESC LIMIT 1""", (receipt,))
    previous = cur.fetchone()
    if previous:
        return {"ok": True, "already_completed": True,
                "deleted_customers": previous["details"]["deleted_customers"],
                "deleted_activities": previous["details"]["deleted_activities"]}
    if snapshot["expires"] < time.time():
        raise db.AuthError(410, "L’aperçu a expiré. Rechargez-le avant de confirmer.")
    cur.execute("SET LOCAL lock_timeout = '10s'")
    cur.execute("SET LOCAL statement_timeout = '60s'")
    cur.execute("LOCK TABLE " + ", ".join(TABLES) + " IN SHARE ROW EXCLUSIVE MODE")
    cur.execute("SELECT id FROM shineray_users WHERE NOT is_admin AND id<=%s",
                (snapshot["cutoff"],))
    ids = [row["id"] for row in cur.fetchall()]
    deleted_activities = 0
    if ids:
        # Delete dependencies before accounts; no TRUNCATE/CASCADE on shared data.
        for table in (
            "shineray_admin_sessions", "shineray_sessions",
            "shineray_admin_login_attempts", "shineray_demo_activity",
            "shineray_gift_redemptions", "shineray_product_income",
            "shineray_withdrawal_requests", "shineray_sonarapay_orders",
            "shineray_first_deposits",
        ):
            cur.execute(f"DELETE FROM {table} WHERE user_id=ANY(%s)", (ids,))
        cur.execute("""DELETE FROM shineray_first_deposits WHERE deposit_id IN
            (SELECT id FROM shineray_deposit_approvals WHERE approved_by=ANY(%s))""", (ids,))
        cur.execute("DELETE FROM shineray_deposit_approvals "
                    "WHERE user_id=ANY(%s) OR approved_by=ANY(%s)", (ids, ids))
        cur.execute("DELETE FROM shineray_manual_deposits WHERE user_id=ANY(%s)", (ids,))
        for table in ("shineray_admin_operations", "shineray_admin_vip_grants"):
            cur.execute(f"DELETE FROM {table} WHERE user_id=ANY(%s) OR admin_id=ANY(%s)", (ids, ids))
        cur.execute("""DELETE FROM shineray_admin_audit WHERE admin_id=ANY(%s)
            OR details->>'user_id'=ANY(%s)""", (ids, [str(uid) for uid in ids]))
        cur.execute("DELETE FROM shineray_transactions WHERE user_id=ANY(%s)", (ids,))
        deleted_activities = cur.rowcount
        cur.execute("DELETE FROM shineray_wallets WHERE user_id=ANY(%s)", (ids,))
        cur.execute("UPDATE shineray_users SET referred_by=NULL WHERE referred_by=ANY(%s)", (ids,))
        cur.execute("DELETE FROM shineray_users WHERE id=ANY(%s) AND NOT is_admin", (ids,))
    result = {"ok": True, "already_completed": False,
              "deleted_customers": len(ids), "deleted_activities": deleted_activities}
    # Same transaction: failure to write the security receipt rolls deletion back.
    audit(cur, None, "customer_reset", {**result, "reset_token_hash": receipt})
    return result
