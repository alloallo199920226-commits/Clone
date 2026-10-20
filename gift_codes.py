"""Redeem administrator-issued codes against the real, settled account ledger."""
from datetime import datetime, timezone
import re

from psycopg.types.json import Jsonb

import auth_backend as db
from withdrawals import available_balance


def redeem(user_id, body):
    if not isinstance(body, dict) or set(body) != {"code"} or not isinstance(body["code"], str):
        raise db.AuthError(400, "Saisissez votre code cadeau.")
    code = body["code"].strip().upper()
    if not re.fullmatch(r"[A-Z0-9_-]{16,64}", code):
        raise db.AuthError(400, "Code cadeau invalide.")
    with db.connect() as conn, conn.cursor() as cur:
        # All settled-balance writers lock the account first.
        cur.execute("SELECT id,is_banned,is_blocked FROM shineray_users WHERE id=%s FOR NO KEY UPDATE",
                    (user_id,))
        user = cur.fetchone()
        if not user or user["is_banned"] or user["is_blocked"]:
            raise db.AuthError(403, "Ce compte ne peut pas utiliser de code cadeau.")
        cur.execute("""SELECT id,value FROM shineray_admin_resources
            WHERE kind='gift_code' AND value->>'code'=%s FOR UPDATE""", (code,))
        gift = cur.fetchone()
        if not gift:
            raise db.AuthError(404, "Code cadeau invalide.")
        cur.execute("""SELECT amount_fcfa FROM shineray_gift_redemptions
            WHERE gift_id=%s AND user_id=%s""", (gift["id"], user_id))
        prior = cur.fetchone()
        if prior:
            return {"ok": True, "alreadyRedeemed": True, "amount": prior["amount_fcfa"],
                    "balance_fcfa": available_balance(cur, user_id)}
        value = gift["value"]
        if value.get("active") is not True:
            raise db.AuthError(409, "Ce code cadeau est désactivé.")
        try:
            expiry = datetime.fromisoformat(value["expiresAt"])
            if expiry.tzinfo is None:
                raise ValueError()
            amount, maximum, used = value["amount"], value["maxRedemptions"], value["redemptions"]
            if not (type(amount) is int and 1 <= amount <= 100_000_000
                    and type(maximum) is int and 1 <= maximum <= 10000
                    and type(used) is int and used >= 0):
                raise ValueError()
        except (ValueError, KeyError, TypeError):
            raise db.AuthError(503, "Configuration du code cadeau invalide.")
        cur.execute("SELECT clock_timestamp() AS now")
        if expiry.astimezone(timezone.utc) <= cur.fetchone()["now"]:
            raise db.AuthError(409, "Ce code cadeau a expiré.")
        if used >= maximum:
            raise db.AuthError(409, "Ce code cadeau a atteint sa limite d’utilisations.")
        reference = f"gift-code:{gift['id']}:{user_id}"
        cur.execute("""INSERT INTO shineray_gift_redemptions(gift_id,user_id,amount_fcfa)
            VALUES (%s,%s,%s)""", (gift["id"], user_id, amount))
        cur.execute("""INSERT INTO shineray_transactions
            (user_id,kind,label,amount_fcfa,provider_reference,details)
            VALUES (%s,'bonus','Bonus code cadeau',%s,%s,%s)""",
                    (user_id, amount, reference,
                     Jsonb({"source": "gift_code", "gift_code_id": gift["id"]})))
        cur.execute("""UPDATE shineray_admin_resources SET value=%s,updated_at=now()
            WHERE id=%s""", (Jsonb({**value, "redemptions": used + 1}), gift["id"]))
        return {"ok": True, "alreadyRedeemed": False, "amount": amount,
                "balance_fcfa": available_balance(cur, user_id)}
