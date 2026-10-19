"""Customer declarations of manual transfers; never credits funds on submission."""
import json
import re
import uuid

import auth_backend as db
import sonarapay_client


def submit(user, body):
    if not isinstance(body, dict) or set(body) != {"request_id", "channel_id", "amount_fcfa", "phone"}:
        raise ValueError("Demande de dépôt invalide.")
    try:
        request_id = str(uuid.UUID(body["request_id"]))
    except (ValueError, TypeError, AttributeError):
        raise ValueError("Référence de demande invalide.")
    amount = body["amount_fcfa"]
    if type(amount) is not int or not 500 <= amount <= db.MAX_ACTIVITY_AMOUNT:
        raise ValueError("Montant de dépôt invalide.")
    channel_id = body["channel_id"]
    if type(channel_id) is not int or channel_id < 1:
        raise ValueError("Moyen de paiement invalide.")
    prefix = next((p for p in db.PHONE_LENGTHS if user["phone"].startswith(p)), None)
    phone = body["phone"]
    if not prefix or not isinstance(phone, str) or not re.fullmatch(r"\d{%d}" % db.PHONE_LENGTHS[prefix], phone):
        raise ValueError("Numéro de paiement invalide.")
    payer = prefix + phone
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT id FROM shineray_users WHERE id=%s FOR NO KEY UPDATE", (user["id"],))
        cur.execute("SELECT * FROM shineray_manual_deposits WHERE request_id=%s", (request_id,))
        previous = cur.fetchone()
        if previous:
            if (previous["user_id"], previous["channel_id"], previous["amount_fcfa"], previous["payer_phone"]) != (
                    user["id"], channel_id, amount, payer):
                raise db.AuthError(409, "Cette référence correspond à une autre demande.")
            return public(previous)
        cur.execute("SELECT value FROM shineray_admin_resources WHERE id=%s AND kind='channel' FOR SHARE", (channel_id,))
        row = cur.fetchone()
        channel = row["value"] if row else {}
        automatic = bool(sonarapay_client.configured() and sonarapay_client.deposit_operators(prefix))
        if (channel.get("isActive") is not True or channel.get("countryCode") != prefix
                or (automatic and (prefix != "+225" or "wave" not in channel.get("operatorName", "").casefold()))
                or not channel.get("receiverNumber") or not channel.get("receiverName")):
            raise ValueError("Ce moyen de paiement manuel n’est pas disponible.")
        cur.execute("SELECT count(*) AS total FROM shineray_manual_deposits WHERE user_id=%s AND status='pending'", (user["id"],))
        if cur.fetchone()["total"] >= 10:
            raise db.AuthError(409, "Vous avez déjà plusieurs dépôts en attente. Attendez leur validation.")
        snapshot = {key: channel.get(key, "") for key in ("operatorName", "receiverName", "receiverNumber", "countryCode")}
        cur.execute("""INSERT INTO shineray_manual_deposits
            (request_id,user_id,channel_id,amount_fcfa,payer_phone,channel_snapshot)
            VALUES (%s,%s,%s,%s,%s,%s::jsonb) RETURNING *""",
                    (request_id, user["id"], channel_id, amount, payer, json.dumps(snapshot)))
        return public(cur.fetchone())


def public(row):
    return {"id": "manual-" + str(row["id"]), "reference": "MAN-" + str(row["request_id"]),
            "status": row["status"]}


def review(handler, request_id, status):
    """Only an authenticated console may approve a verified transfer or reject it."""
    import admin_api
    import deposit_settlement
    if status not in {"approved", "rejected"}:
        raise ValueError("Décision invalide.")
    with db.connect() as conn, conn.cursor() as cur:
        admin_api.require_admin(cur, handler)
        cur.execute("SELECT * FROM shineray_manual_deposits WHERE id=%s FOR UPDATE", (request_id,))
        row = cur.fetchone()
        if not row:
            raise db.AuthError(404, "Demande introuvable.")
        if row["status"] != "pending":
            if row["status"] != status:
                raise db.AuthError(409, "Cette demande a déjà été traitée.")
            return {"ok": True}
        if status == "approved":
            channel = row["channel_snapshot"]
            deposit_settlement.settle_approved_deposit(
                row["user_id"], row["amount_fcfa"], "MAN-" + str(row["request_id"]),
                approval_method="manual", console_handler=handler, connection=conn,
                receipt_details={"provider": "manual", "channel": channel["operatorName"],
                                 "payer_number": row["payer_phone"]})
        cur.execute("UPDATE shineray_manual_deposits SET status=%s WHERE id=%s", (status, request_id))
        admin_api.audit(cur, None, "review_manual_deposit", {"request_id": request_id, "status": status})
    return {"ok": True}
