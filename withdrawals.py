"""Manual withdrawal requests. Reservations are not settled payments."""
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from psycopg.types.json import Jsonb

import auth_backend as db
import withdrawal_controls

MINIMUM_FCFA = 2300
FEE_PERCENT = 20
MOROCCO = ZoneInfo("Africa/Casablanca")


def withdrawal_window_open(now=None):
    local = (now or datetime.now(MOROCCO)).astimezone(MOROCCO)
    return 10 <= local.hour < 18


def withdrawal_cutoff_reached(now=None):
    """The 18:00 Morocco cutoff also applies to manual opening."""
    local = (now or datetime.now(MOROCCO)).astimezone(MOROCCO)
    return local.hour >= 18


def available_balance(cur, user_id):
    cur.execute("""SELECT
        COALESCE((SELECT sum(amount_fcfa) FROM shineray_transactions WHERE user_id=%s),0)
        - COALESCE((SELECT sum(amount_fcfa) FROM shineray_withdrawal_requests
                    WHERE user_id=%s AND status='pending'),0) AS balance""", (user_id, user_id))
    return int(cur.fetchone()["balance"])


def active_vip(cur, user_id):
    cur.execute("""SELECT
        EXISTS(SELECT 1 FROM shineray_admin_vip_grants
               WHERE user_id=%s AND status='active' AND created_at<=now() AND expires_at>now())
        OR EXISTS(SELECT 1 FROM shineray_transactions
          WHERE user_id=%s AND kind='purchase'
          AND details->>'vip' ~ '^([1-9]|1[0-2])$'
          AND CASE WHEN details->>'validity_days' ~ '^[1-9][0-9]{0,5}$'
              THEN created_at<=now() AND
                created_at + ((details->>'validity_days')::int * interval '1 day') > now()
              ELSE false END) AS active""", (user_id, user_id))
    return cur.fetchone()["active"]


def submit(user_id, body):
    if not isinstance(body, dict) or set(body) != {"request_id", "wallet_id", "amount_fcfa"}:
        raise ValueError("Champs de retrait invalides.")
    try:
        request_id = str(uuid.UUID(str(body["request_id"])))
    except (ValueError, TypeError, AttributeError):
        raise ValueError("Identifiant de demande invalide.") from None
    amount, wallet_id = body["amount_fcfa"], body["wallet_id"]
    if type(amount) is not int or not 1 <= amount <= db.MAX_ACTIVITY_AMOUNT:
        raise ValueError("Saisissez un montant entier positif valide.")
    if type(wallet_id) is not int or wallet_id < 1:
        raise ValueError("Compte de retrait invalide.")
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT id,is_banned,is_blocked,withdrawals_disabled FROM shineray_users WHERE id=%s FOR NO KEY UPDATE", (user_id,))
        user = cur.fetchone()
        if not user or user["is_banned"] or user["is_blocked"]:
            raise db.AuthError(403, "Compte indisponible.")
        cur.execute("SELECT * FROM shineray_withdrawal_requests WHERE request_id=%s", (request_id,))
        prior = cur.fetchone()
        if prior:
            if (prior["user_id"], prior["wallet_id"], prior["amount_fcfa"]) != (user_id, wallet_id, amount):
                raise db.AuthError(409, "Cet identifiant correspond à une autre demande.")
            return {**public(prior), "balance_fcfa": available_balance(cur, user_id)}
        if amount < MINIMUM_FCFA:
            raise ValueError("Le montant minimum de retrait est de 2 300 FCFA.")
        if user["withdrawals_disabled"]:
            raise db.AuthError(403, "Les retraits sont désactivés pour votre compte.")
        withdrawal_controls.enforce(cur)
        if not active_vip(cur, user_id):
            raise db.AuthError(403, "Vous devez avoir au moins un VIP actif pour effectuer un retrait.")
        cur.execute("SELECT * FROM shineray_wallets WHERE id=%s AND user_id=%s", (wallet_id, user_id))
        wallet = cur.fetchone()
        if not wallet:
            raise ValueError("Sélectionnez un compte de retrait vous appartenant.")
        if available_balance(cur, user_id) < amount:
            raise db.AuthError(409, "Solde disponible insuffisant. Les retraits en attente sont déjà réservés.")
        # Snapshot the policy on submission; pending requests keep their original fee.
        fee = amount * FEE_PERCENT // 100
        cur.execute("""INSERT INTO shineray_withdrawal_requests
            (request_id,user_id,wallet_id,amount_fcfa,fee_fcfa,net_amount_fcfa,wallet_snapshot)
            VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (request_id, user_id, wallet_id, amount, fee, amount-fee,
             Jsonb({"channel": wallet["provider"], "destination": wallet["phone"],
                    "receiver_name": wallet["holder_name"]})))
        row = cur.fetchone()
        return {**public(row), "balance_fcfa": available_balance(cur, user_id)}


def public(row):
    return {"id": "withdraw-" + str(row["id"]), "reference": "RET-" + str(row["request_id"]),
            "status": row["status"], "amount_fcfa": row["amount_fcfa"],
            "fee_fcfa": row["fee_fcfa"], "net_amount_fcfa": row["net_amount_fcfa"]}


def review(handler, request_id, status):
    import admin_api
    if status == "completed":  # Original administration client wire value.
        status = "approved"
    if status not in {"approved", "rejected"}:
        raise ValueError("État de retrait invalide.")
    with db.connect() as conn, conn.cursor() as cur:
        admin_api.require_admin(cur, handler)
        # Always lock the account before the request, matching submission/spending.
        cur.execute("SELECT user_id FROM shineray_withdrawal_requests WHERE id=%s", (request_id,))
        found = cur.fetchone()
        if not found:
            raise db.AuthError(404, "Demande de retrait introuvable.")
        cur.execute("SELECT id FROM shineray_users WHERE id=%s FOR NO KEY UPDATE", (found["user_id"],))
        cur.execute("SELECT * FROM shineray_withdrawal_requests WHERE id=%s FOR UPDATE", (request_id,))
        row = cur.fetchone()
        if row["status"] != "pending":
            if row["status"] != status:
                raise db.AuthError(409, "Cette demande a déjà été traitée.")
            return {"ok": True, "withdrawal": public(row)}
        if status == "approved":
            # Approval means the administrator has actually sent the manual payout.
            details = {**row["wallet_snapshot"], "provider": "manual",
                       "fee_fcfa": row["fee_fcfa"], "net_amount_fcfa": row["net_amount_fcfa"]}
            cur.execute("""INSERT INTO shineray_transactions
                (user_id,kind,label,amount_fcfa,provider_reference,details)
                VALUES (%s,'withdrawal','Retrait manuel',%s,%s,%s)""",
                (row["user_id"], -row["amount_fcfa"], "RET-"+str(row["request_id"]), Jsonb(details)))
        cur.execute("UPDATE shineray_withdrawal_requests SET status=%s,reviewed_at=now() WHERE id=%s",
                    (status, request_id))
        admin_api.audit(cur, None, "withdrawal_"+status, {"withdrawal_id": request_id, "user_id": row["user_id"]})
        row["status"] = status
        return {"ok": True, "withdrawal": public(row)}
