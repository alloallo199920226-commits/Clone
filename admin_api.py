"""Compatibility API for the unmodified, uploaded administration client.

Existing customer identities and the settled ledger remain authoritative. Services
not yet connected are rejected explicitly, never represented as successful payments.
"""

import hashlib
import hmac
import json
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie
from urllib.parse import parse_qs, urlsplit

from psycopg.errors import UniqueViolation
from psycopg.types.json import Jsonb

import auth_backend as db
import admin_console_auth
from financial_policy import MIN_DEPOSIT_FCFA, WELCOME_BONUS_FCFA

COOKIE = "shineray_admin"
RESOURCE_ROUTES = {
    "products": ("product", "products"),
    "gift-codes": ("gift_code", "codes"),
    "payment-channels": ("channel", "channels"),
    "announcements": ("announcement", "announcements"),
}
COUNTRIES = {
    "Bénin": "+229", "Togo": "+228", "Niger": "+227", "Tchad": "+235",
    "Cameroun": "+237", "Sénégal": "+221", "Burkina Faso": "+226",
    "Côte d'Ivoire": "+225",
}
USER_FIELDS = """u.id,u.phone,u.referral_code AS "referralCode",
    u.referred_by AS "referrerId",u.created_at AS "createdAt",
    u.is_banned AS "isBanned",u.is_blocked AS "isBlocked",
    u.withdrawals_disabled AS "withdrawalsDisabled",
    CASE WHEN u.phone LIKE '+225%%' THEN 'CI' ELSE 'TG' END AS country"""
CONFIG = {
    "depositMin": MIN_DEPOSIT_FCFA, "withdrawalMin": 2200,
    # No fee or check-in policy is activated by importing an administration.
    "withdrawalFeePercent": None, "dashboxDeposit": 500,
    "dashboxWithdraw": 2200, "signupBonus": WELCOME_BONUS_FCFA,
    "checkinBonus": None, "maxWithdrawals": None,
}


def fail(status, message):
    raise db.AuthError(status, message)


def integer(value, minimum=1, maximum=500_000_000):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError("Montant ou identifiant entier invalide.")
    return value


def text(value, maximum=160, required=True):
    if not isinstance(value, str) or (required and not value.strip()) or len(value) > maximum:
        raise ValueError("Texte absent ou trop long.")
    return value.strip()


def fields(body, allowed):
    if set(body) - set(allowed):
        raise ValueError("Champs de requête inattendus.")


def serialize(value):
    """Convert only actual stored facts into JSON-compatible values."""
    return json.loads(json.dumps(value, default=lambda v: v.isoformat()))


def cookie_token(handler):
    jar = SimpleCookie()
    try:
        jar.load(handler.headers.get("Cookie", ""))
        return jar[COOKIE].value if COOKIE in jar else None
    except Exception:
        return None


def audit(cur, actor, event, details=None):
    cur.execute("""INSERT INTO shineray_admin_audit(admin_id,event_type,details)
                   VALUES (%s,%s,%s)""",
                (actor, event, Jsonb({**(details or {}), "principal": "dedicated_console"})))


def configured_password():
    """Read only on the server; a missing/weak secret must never enable fallback."""
    password = os.getenv("ADMIN_ACCESS_PASSWORD", "")
    if not 16 <= len(password) <= 256 or len(password.encode("utf-8")) > 1024:
        fail(503, "L’accès administrateur exige un mot de passe dédié de 16 à 256 caractères configuré dans les secrets.")
    return password.encode("utf-8")


def admin_token_hash(token, password=None):
    # Binding sessions to the secret also revokes older sessions after rotation.
    key = configured_password() if password is None else password
    return hmac.new(key, ("console-session-v2:" + token).encode("utf-8"), hashlib.sha256).hexdigest()


def require_admin(cur, handler, user=None):
    admin_console_auth.require_console(cur, handler, admin_token_hash, cookie_token, fail)


def login(handler, user, body):
    admin_console_auth.login(handler, body, configured_password=configured_password,
                            token_hash=admin_token_hash, cookie_token=cookie_token,
                            cookie=COOKIE, audit=audit, fail=fail)


def user_rows(cur, search="", offset=0, limit=50):
    pattern = "%" + search + "%"
    where = "(u.phone ILIKE %s OR u.id::text=%s OR u.referral_code ILIKE %s)"
    params = (pattern, search, pattern)
    cur.execute(f"SELECT count(*) total FROM shineray_users u WHERE {where}", params)
    total = cur.fetchone()["total"]
    cur.execute(f"""SELECT {USER_FIELDS},
        COALESCE((SELECT sum(t.amount_fcfa) FROM shineray_transactions t WHERE t.user_id=u.id),0)::bigint balance
        FROM shineray_users u WHERE {where} ORDER BY u.created_at DESC,u.id DESC LIMIT %s OFFSET %s""",
                (*params, limit + 1, offset))
    rows = cur.fetchall()
    return {"users": serialize(rows[:limit]), "total": total,
            "nextCursor": str(offset + limit) if len(rows) > limit else None}


def transaction_rows(cur, query):
    kind = query.get("type", "all")
    status = query.get("status", "all")
    assistance = query.get("assistance", "all")
    if kind not in {"all", "deposit", "withdrawal"} or status not in {"all", "pending", "approved", "rejected"} or assistance not in {"all", "admin", "normal"}:
        raise ValueError("Filtre d’historique invalide.")
    offset = pagination(query.get("cursor", "0"))
    limit = min(pagination(query.get("limit", "50")), 100)
    if not limit:
        raise ValueError("Pagination invalide.")
    search = text(query.get("search", ""), 100, False)
    params = {"kind": kind, "status": status, "assistance": assistance,
              "pattern": "%" + search + "%", "search": search,
              "limit": limit + 1, "offset": offset}
    # Pending payments are not manufactured from balances or simulated activity.
    source = """WITH history AS (
        SELECT t.*,u.phone,
            CASE WHEN t.kind='recharge' THEN 'deposit' ELSE 'withdrawal' END type,
            EXISTS(SELECT 1 FROM shineray_admin_operations ao WHERE ao.user_id=t.user_id AND ao.operation_type='admin_credit') assisted
        FROM shineray_transactions t JOIN shineray_users u ON u.id=t.user_id
        WHERE t.kind IN ('recharge','withdrawal'))
        SELECT * FROM history WHERE
          (%(kind)s='all' OR type=%(kind)s)
          AND %(status)s IN ('all','approved')
          AND (%(assistance)s='all' OR (%(assistance)s='admin' AND assisted) OR (%(assistance)s='normal' AND NOT assisted))
          AND (phone ILIKE %(pattern)s OR provider_reference ILIKE %(pattern)s OR id::text=%(search)s)"""
    cur.execute(f"SELECT count(*) total FROM ({source}) matched", params)
    total = cur.fetchone()["total"]
    cur.execute(source + " ORDER BY created_at DESC,id DESC LIMIT %(limit)s OFFSET %(offset)s", params)
    rows = cur.fetchall()
    result = []
    for row in rows[:limit]:
        details = row["details"]
        result.append({
            "id": row["id"], "userId": row["user_id"], "userPhone": row["phone"],
            "registrationNumber": row["phone"], "countryCode": "CI" if row["phone"].startswith("+225") else "TG",
            "amount": abs(row["amount_fcfa"]), "status": "completed", "type": row["type"],
            "reference": row["provider_reference"], "orderNumber": row["provider_reference"],
            "createdAt": row["created_at"].isoformat(), "initiatedAt": row["created_at"].isoformat(),
            "paymentProvider": details.get("approval_method", "manual"),
            "operatorName": details.get("channel") or "Non renseigné",
            "payerNumber": details.get("payer_number") or row["phone"],
            "destination": details.get("destination"), "receiverName": details.get("receiver_name"),
            "netAmount": details.get("net_amount_fcfa"), "fee": details.get("fee_fcfa"),
            "adminAssisted": row["assisted"], "referralCount": 0,
        })
    return {"transactions": result, "total": total,
            "nextCursor": str(offset + limit) if len(rows) > limit else None}


def pagination(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{1,7}", value):
        raise ValueError("Pagination invalide.")
    return int(value)


def resources(cur, kind):
    cur.execute("SELECT * FROM shineray_admin_resources WHERE kind=%s ORDER BY id DESC", (kind,))
    return [resource(row) for row in cur.fetchall()]


def resource(row):
    return {**row["value"], "id": row["id"], "createdAt": row["created_at"].isoformat(),
            "updatedAt": row["updated_at"].isoformat()}


def overview(cur, summary):
    cur.execute("""SELECT
        (SELECT count(*) FROM shineray_users)::int users,
        COALESCE(sum(amount_fcfa) FILTER (WHERE kind='recharge'),0)::bigint AS "approvedDeposits",
        COALESCE(-sum(amount_fcfa) FILTER (WHERE kind='withdrawal'),0)::bigint AS "approvedWithdrawals",
        count(*) FILTER (WHERE kind='recharge')::int AS "approvedDepositCount",
        count(*) FILTER (WHERE kind='withdrawal')::int AS "approvedWithdrawalCount",
        COALESCE(sum(amount_fcfa) FILTER (WHERE details->>'admin_type'='admin_credit'),0)::bigint AS "adminCredits",
        count(*) FILTER (WHERE kind='purchase')::int AS vip_purchases
        FROM shineray_transactions""")
    stats = cur.fetchone()
    cur.execute("SELECT count(*)::int count FROM shineray_admin_vip_grants WHERE status='active' AND expires_at>now()")
    active = cur.fetchone()["count"]
    stats.update(investments=active, active_vips=active, pendingDeposits=0, pendingWithdrawals=0,
                 rejectedDepositCount=0, rejectedWithdrawalCount=0)
    txs = [] if summary else transaction_rows(cur, {"limit": "100"})["transactions"]
    cur.execute("""SELECT 'purchase-'||t.id AS id,t.user_id AS "userId",t.details->>'product_name' AS "productName",
        abs(t.amount_fcfa) amount,t.created_at AS "createdAt",u.phone AS "userPhone",
        'purchase' source,'completed' status
        FROM shineray_transactions t JOIN shineray_users u ON u.id=t.user_id
        WHERE t.kind='purchase' ORDER BY t.created_at DESC LIMIT 500""")
    orders = cur.fetchall()
    cur.execute("""SELECT g.id,g.user_id AS "userId",g.product_id AS "productId",
        g.product_snapshot->>'name' AS "productName",0 amount,g.status,'admin' source,
        g.created_at AS "createdAt",u.phone AS "userPhone"
        FROM shineray_admin_vip_grants g JOIN shineray_users u ON u.id=g.user_id
        ORDER BY g.created_at DESC LIMIT 500""")
    orders.extend(cur.fetchall())
    return {"stats": stats, "users": user_rows(cur, limit=500)["users"],
            "transactions": txs, "deposits": [t for t in txs if t["type"] == "deposit"],
            "withdrawals": [t for t in txs if t["type"] == "withdrawal"],
            "products": resources(cur, "product"), "orders": serialize(orders),
            "community": {"isOpen": False, "closureMessage": "Service non activé."},
            "withdrawOpenOverride": False, "withdrawClosedOverride": True}


def user_detail(cur, uid):
    cur.execute(f"SELECT {USER_FIELDS} FROM shineray_users u WHERE u.id=%s", (uid,))
    user = cur.fetchone()
    if not user:
        fail(404, "Utilisateur introuvable.")
    cur.execute("""SELECT
        COALESCE(sum(amount_fcfa),0)::bigint balance,
        COALESCE(sum(amount_fcfa) FILTER(WHERE kind='recharge'),0)::bigint AS "totalDeposits",
        COALESCE(-sum(amount_fcfa) FILTER(WHERE kind='withdrawal'),0)::bigint AS "totalWithdrawals",
        COALESCE(sum(amount_fcfa) FILTER(WHERE kind='commission'),0)::bigint AS "totalCommissions",
        COALESCE(sum(amount_fcfa) FILTER(WHERE details->>'admin_type'='admin_credit'),0)::bigint AS "totalAdminCredits",
        COALESCE(-sum(amount_fcfa) FILTER(WHERE details->>'admin_type'='admin_debit'),0)::bigint AS "totalAdminDebits"
        FROM shineray_transactions WHERE user_id=%s""", (uid,))
    wallet = cur.fetchone()
    cur.execute("""SELECT id,COALESCE(details->>'admin_type',kind) type,abs(amount_fcfa) amount,
        'completed' status,created_at AS "createdAt" FROM shineray_transactions
        WHERE user_id=%s ORDER BY created_at DESC,id DESC LIMIT 100""", (uid,))
    transactions = cur.fetchall()
    cur.execute("""SELECT 'purchase-'||id AS id,details->>'product_name' AS "productName",abs(amount_fcfa) amount,
        'completed' status,'purchase' source,created_at AS "createdAt"
        FROM shineray_transactions WHERE user_id=%s AND kind='purchase' ORDER BY created_at DESC""", (uid,))
    orders = cur.fetchall()
    cur.execute("""SELECT id,product_snapshot->>'name' AS "productName",0 amount,
        status,'admin' source,created_at AS "createdAt"
        FROM shineray_admin_vip_grants WHERE user_id=%s ORDER BY created_at DESC""", (uid,))
    orders.extend(cur.fetchall())
    return serialize({"user": user, "wallet": wallet, "transactions": transactions, "orders": orders, "checkins": []})


def grant_vip(cur, actor, uid, body):
    fields(body, {"productId", "requestId"})
    product_id = integer(body.get("productId"))
    request_id = text(body.get("requestId"), 120)
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,120}", request_id):
        raise ValueError("Identifiant d’opération invalide.")
    cur.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (request_id,))
    cur.execute("SELECT * FROM shineray_admin_vip_grants WHERE request_id=%s", (request_id,))
    prior = cur.fetchone()
    if prior:
        if (prior["admin_id"], prior["user_id"], prior["product_id"]) != (actor, uid, product_id):
            fail(409, "Cet identifiant correspond à une autre attribution.")
        return {"ok": True, "purchaseId": prior["id"]}
    cur.execute("SELECT id FROM shineray_users WHERE id=%s FOR NO KEY UPDATE", (uid,))
    if not cur.fetchone():
        fail(404, "Utilisateur introuvable.")
    cur.execute("SELECT value FROM shineray_admin_resources WHERE kind='product' AND id=%s FOR SHARE", (product_id,))
    product = cur.fetchone()
    if not product or not product["value"].get("active"):
        fail(404, "Produit actif introuvable.")
    value = product["value"]
    cur.execute("""INSERT INTO shineray_admin_vip_grants
        (request_id,user_id,admin_id,product_id,product_snapshot,expires_at)
        VALUES (%s,%s,%s,%s,%s,now()+make_interval(days=>%s)) RETURNING id""",
                (request_id, uid, actor, product_id, Jsonb(value), value["durationDays"]))
    grant_id = cur.fetchone()["id"]
    audit(cur, actor, "grant_vip", {"user_id": uid, "grant_id": grant_id, "request_id": request_id})
    return {"ok": True, "purchaseId": grant_id}


def money_operation(cur, actor, uid, action, body):
    fields(body, {"amount", "requestId"})
    amount = integer(body.get("amount"))
    request_id = text(body.get("requestId"), 120)
    if not re.fullmatch(r"[A-Za-z0-9_-]{8,120}", request_id):
        raise ValueError("Identifiant d’opération invalide.")
    operation = "admin_" + action
    cur.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (request_id,))
    cur.execute("SELECT * FROM shineray_admin_operations WHERE request_id=%s", (request_id,))
    prior = cur.fetchone()
    if prior:
        if (prior["admin_id"], prior["user_id"], prior["operation_type"], prior["amount_fcfa"]) != (actor, uid, operation, amount):
            fail(409, "Cet identifiant correspond à une autre opération.")
        return prior["result"]
    # Match the deposit service's lock mode: permit FK checks without deadlocks.
    cur.execute("SELECT id FROM shineray_users WHERE id=%s FOR NO KEY UPDATE", (uid,))
    if not cur.fetchone():
        fail(404, "Utilisateur introuvable.")
    cur.execute("SELECT COALESCE(sum(amount_fcfa),0)::bigint balance FROM shineray_transactions WHERE user_id=%s", (uid,))
    balance = cur.fetchone()["balance"]
    if action == "debit" and balance < amount:
        fail(409, "Solde insuffisant pour ce débit.")
    signed = amount if action == "credit" else -amount
    result = {"ok": True, "amount": amount, "type": operation}
    cur.execute("""INSERT INTO shineray_transactions(user_id,kind,label,amount_fcfa,provider_reference,details)
                   VALUES (%s,'bonus',%s,%s,%s,%s)""",
                (uid, "Crédit administrateur" if action == "credit" else "Débit administrateur", signed,
                 "admin:" + request_id, Jsonb({"admin_type": operation, "admin_id": actor, "request_id": request_id})))
    cur.execute("""INSERT INTO shineray_admin_operations(request_id,admin_id,user_id,operation_type,amount_fcfa,result)
                   VALUES (%s,%s,%s,%s,%s,%s)""", (request_id, actor, uid, operation, amount, Jsonb(result)))
    audit(cur, actor, operation, {"user_id": uid, "amount": amount, "request_id": request_id})
    return result


def moderate(cur, actor, uid, action, body):
    fields(body, set())
    if uid == actor:
        fail(409, "Vous ne pouvez pas bloquer ou bannir votre propre compte administrateur.")
    field, value = {
        "ban": ("is_banned", True), "unban": ("is_banned", False),
        "block": ("is_blocked", True), "unblock": ("is_blocked", False),
        "close-withdrawals": ("withdrawals_disabled", True),
        "open-withdrawals": ("withdrawals_disabled", False),
    }[action]
    # field is exclusively selected from the fixed mapping, never request input.
    cur.execute(f"UPDATE shineray_users SET {field}=%s WHERE id=%s RETURNING id", (value, uid))
    if not cur.fetchone():
        fail(404, "Utilisateur introuvable.")
    if value and field in {"is_banned", "is_blocked"}:
        cur.execute("DELETE FROM shineray_sessions WHERE user_id=%s", (uid,))
    audit(cur, actor, action, {"user_id": uid})
    return {"ok": True}


def validated_resource(kind, body, prior=None):
    prior = prior or {}
    if kind == "product":
        fields(body, {"name", "price", "dailyIncome", "totalIncome", "durationDays", "imageClass", "code"})
        value = {**prior, **body}
        value.update(name=text(value.get("name"), 160),
                     price=integer(value.get("price")),
                     dailyIncome=integer(value.get("dailyIncome")),
                     totalIncome=integer(value.get("totalIncome")),
                     durationDays=integer(value.get("durationDays"), 1, 3650))
        value.setdefault("code", "VIP" + secrets.token_hex(4).upper())
        if not re.fullmatch(r"[A-Z0-9_-]{2,32}", value["code"]):
            raise ValueError("Code produit invalide.")
        value.setdefault("imageClass", "")
        value.setdefault("active", True)
    elif kind == "channel":
        fields(body, {"country", "countryCode", "operatorName", "receiverNumber", "receiverName",
                      "ussdTemplate", "logoUrl", "logoColor", "logoText", "isActive", "sortOrder"})
        value = {**prior, **body}
        for key in ("country", "countryCode", "operatorName", "receiverNumber"):
            value[key] = text(value.get(key), 160)
        if COUNTRIES.get(value["country"]) != value["countryCode"]:
            raise ValueError("Pays et indicatif incompatibles.")
        if not re.fullmatch(r"\+?\d[\d -]{5,38}", value["receiverNumber"]):
            raise ValueError("Compte marchand invalide.")
        for key in ("receiverName", "ussdTemplate", "logoUrl", "logoText"):
            value[key] = text(value.get(key, ""), 500, False)
        if value["logoUrl"] and not value["logoUrl"].startswith("https://"):
            raise ValueError("Utilisez une URL de logo HTTPS.")
        value.setdefault("logoColor", "#26352d")
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value["logoColor"]):
            raise ValueError("Couleur invalide.")
        value.setdefault("isActive", True)
        if type(value["isActive"]) is not bool:
            raise ValueError("État du canal invalide.")
        raw_sort = value.get("sortOrder", 0)
        if isinstance(raw_sort, str) and re.fullmatch(r"\d{1,5}", raw_sort):
            raw_sort = int(raw_sort)
        value["sortOrder"] = integer(raw_sort, 0, 99999)
    elif kind == "announcement":
        fields(body, {"title", "content", "kind", "audience", "audienceLevel"})
        value = {**prior, **body}
        value["title"] = text(value.get("title"), 160)
        value["content"] = text(value.get("content"), 8000)
        value.setdefault("kind", "announcement")
        value.setdefault("audience", "all")
        if value["kind"] not in {"announcement", "notification"} or value["audience"] not in {"all", "level"}:
            raise ValueError("Type ou destinataires invalides.")
        value["audienceLevel"] = text(value.get("audienceLevel") or "", 80, value["audience"] == "level")
        value.setdefault("status", "draft")
        value.setdefault("publishedAt", None)
    else:
        fields(body, {"code", "amount", "maxRedemptions", "expiresInDays"})
        code = text(body.get("code", ""), 64, False).upper() or secrets.token_hex(16).upper()
        if not re.fullmatch(r"[A-Z0-9_-]{16,64}", code):
            raise ValueError("Le code doit contenir entre 16 et 64 caractères.")
        days = integer(body.get("expiresInDays", 30), 1, 365)
        value = {"code": code, "amount": integer(body.get("amount"), 1, 100_000_000),
                 "maxRedemptions": integer(body.get("maxRedemptions", 1), 1, 10000),
                 "redemptions": 0, "active": True,
                 "expiresAt": (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()}
    return value


def resource_api(cur, actor, segment, ident, action, method, body):
    kind, list_key = RESOURCE_ROUTES[segment]
    if ident is None:
        if method == "GET":
            items = resources(cur, kind)
            if kind == "gift_code":
                items = [item for item in items if item["active"]]
            return 200, {list_key: items}
        if method != "POST":
            fail(405, "Méthode non autorisée.")
        value = validated_resource(kind, body)
        cur.execute("""INSERT INTO shineray_admin_resources(kind,value) VALUES (%s,%s) RETURNING *""", (kind, Jsonb(value)))
        row = resource(cur.fetchone())
        audit(cur, actor, "create_" + kind, {"id": row["id"]})
        return 201, {"ok": True, kind if kind != "gift_code" else "code": row}
    cur.execute("SELECT * FROM shineray_admin_resources WHERE kind=%s AND id=%s FOR UPDATE", (kind, ident))
    row = cur.fetchone()
    if not row:
        fail(404, "Élément introuvable.")
    value = row["value"]
    if kind == "product" and action == "permanent" and method == "DELETE":
        cur.execute("SELECT 1 FROM shineray_transactions WHERE kind='purchase' AND details->>'product_id'=%s LIMIT 1", (str(ident),))
        if cur.fetchone():
            fail(409, "Produit déjà acheté. Désactivez-le pour conserver l’historique.")
        cur.execute("SELECT 1 FROM shineray_admin_vip_grants WHERE product_id=%s LIMIT 1", (ident,))
        if cur.fetchone():
            fail(409, "Produit déjà attribué. Désactivez-le pour conserver l’historique.")
        cur.execute("DELETE FROM shineray_admin_resources WHERE id=%s", (ident,))
    elif kind == "product" and ((action == "activate" and method == "PATCH") or (not action and method == "DELETE")):
        value["active"] = action == "activate"
        cur.execute("UPDATE shineray_admin_resources SET value=%s,updated_at=now() WHERE id=%s", (Jsonb(value), ident))
    elif kind == "announcement" and action in {"publish", "withdraw"} and method == "POST":
        value["status"] = "published" if action == "publish" else "draft"
        value["publishedAt"] = datetime.now(timezone.utc).isoformat() if action == "publish" else None
        cur.execute("UPDATE shineray_admin_resources SET value=%s,updated_at=now() WHERE id=%s", (Jsonb(value), ident))
    elif not action and method == "DELETE":
        if kind == "gift_code":
            value["active"] = False
            cur.execute("UPDATE shineray_admin_resources SET value=%s,updated_at=now() WHERE id=%s", (Jsonb(value), ident))
        else:
            cur.execute("DELETE FROM shineray_admin_resources WHERE id=%s", (ident,))
    elif not action and method == "PATCH" and kind != "gift_code":
        if kind == "announcement" and value["status"] != "draft":
            fail(409, "Retirez l’annonce avant de modifier son brouillon.")
        value = validated_resource(kind, body, value)
        cur.execute("UPDATE shineray_admin_resources SET value=%s,updated_at=now() WHERE id=%s", (Jsonb(value), ident))
    else:
        fail(405, "Méthode non autorisée.")
    audit(cur, actor, "update_" + kind, {"id": ident, "action": action or method})
    return 200, {"ok": True}


def dispatch(cur, user, route, method, body, query):
    actor = None  # Dedicated console principal, never a fabricated customer.
    if route == "/api/admin/overview" and method == "GET":
        return 200, overview(cur, query.get("summary") == "true")
    if route == "/api/admin/transaction-history" and method == "GET":
        return 200, transaction_rows(cur, query)
    if route == "/api/admin/users/search" and method == "GET":
        return 200, user_rows(cur, text(query.get("search", ""), 100, False), pagination(query.get("cursor", "0")))
    match = re.fullmatch(r"/api/admin/users/([1-9]\d{0,17})(?:/([a-z-]+))?", route)
    if match:
        uid, action = int(match[1]), match[2]
        if not action and method == "GET":
            return 200, user_detail(cur, uid)
        if action in {"credit", "debit"} and method == "POST":
            return 200, money_operation(cur, actor, uid, action, body)
        if action in {"ban", "unban", "block", "unblock", "close-withdrawals", "open-withdrawals"} and method == "POST":
            return 200, moderate(cur, actor, uid, action, body)
        if action == "grant-vip":
            if method != "POST":
                fail(405, "Méthode non autorisée.")
            return 200, grant_vip(cur, actor, uid, body)
    match = re.fullmatch(r"/api/admin/orders/([1-9]\d{0,17})/revoke-vip", route)
    if match and method == "POST":
        fields(body, set())
        cur.execute("UPDATE shineray_admin_vip_grants SET status='revoked' WHERE id=%s AND status='active' RETURNING id", (int(match[1]),))
        if not cur.fetchone():
            fail(404, "Attribution active introuvable.")
        audit(cur, actor, "revoke_vip", {"grant_id": int(match[1])})
        return 200, {"ok": True}
    match = re.fullmatch(r"/api/admin/(products|gift-codes|payment-channels|announcements)(?:/([1-9]\d{0,17})(?:/([a-z-]+))?)?", route)
    if match:
        return resource_api(cur, actor, match[1], int(match[2]) if match[2] else None, match[3], method, body)
    if route == "/api/admin/popup-config":
        if method == "GET":
            return 200, {"config": CONFIG}
        fail(409, "Les règles actuelles sont conservées : bonus 2 300 FCFA, dépôt minimum 500 FCFA et commissions 40 % / 2 % / 1 %. Les autres services financiers ne sont pas activés ; aucun paramètre n’a été modifié.")
    if route == "/api/admin/payment-provider-controls":
        if method == "GET":
            return 200, {"saspayEnabled": False, "sonarapayAutomaticEnabled": False, "sonarapayConfigured": False}
        fail(503, "Aucun prestataire de paiement n’est connecté. L’activation est impossible ; aucun paiement automatique n’a été autorisé.")
    if route == "/api/admin/withdraw-override":
        fail(503, "Les retraits ne sont pas activés. Aucun horaire ou paiement n’a été modifié.")
    if route == "/api/admin/cameroon-totals" and method == "GET":
        # Existing phone-constrained accounts are exclusively Togo/Côte d'Ivoire.
        return 200, {"country": "Cameroun", "currency": "XAF", "totalDeposits": 0, "totalWithdrawals": 0}
    if route.startswith("/api/admin/users-purge"):
        fail(403, "Suppression massive désactivée : les comptes, soldes et historiques financiers existants doivent être conservés.")
    if route.startswith("/api/admin/support/"):
        fail(503, "La réception des demandes de service client n’est pas encore connectée sur ce site.")
    if route.startswith("/api/admin/social/"):
        fail(503, "Le blogue et les récompenses de publication ne sont pas activés sur ce site.")
    if re.fullmatch(r"/api/admin/(deposits|withdrawals|transactions)/[1-9]\d*", route):
        fail(409, "Aucune demande en attente n’est disponible dans ce parcours. Les opérations déjà créditées sont définitives. Utilisez l’approbation manuelle avec une référence de paiement vérifiée.")
    fail(404, "Route d’administration introuvable.")


def handle(handler, user, route):
    try:
        body = {}
        # The original client sends logout as a body-less POST.
        empty_logout = route == "/api/admin/logout" and handler.headers.get("Content-Length", "0") == "0"
        if handler.command not in {"GET", "HEAD"} and not empty_logout:
            body = handler._read_json()
            if body is None:
                return
        if route == "/api/admin/login":
            if handler.command != "POST":
                fail(405, "Méthode non autorisée.")
            login(handler, user, body)
            return
        # The supplied external history script retains HTML-escaped separators.
        # Normalize its wire format here instead of rewriting the original JS.
        raw_query = urlsplit(handler.path).query.replace("&amp;", "&")
        query = {key: values[0] for key, values in parse_qs(raw_query).items()}
        if route == "/api/admin/deposits":
            if handler.command != "POST":
                fail(405, "Méthode non autorisée.")
            # The settlement service rechecks this session in its own transaction.
            with db.connect() as conn, conn.cursor() as cur:
                require_admin(cur, handler)
            fields(body, {"phone", "amount_fcfa", "provider_reference", "receipt_verified"})
            if body.get("receipt_verified") is not True:
                raise ValueError("Confirmez la réception réelle des fonds avant toute approbation.")
            import deposit_settlement
            result = deposit_settlement.approve_manual_deposit(
                None, body.get("phone"), body.get("amount_fcfa"),
                body.get("provider_reference"), console_handler=handler)
            handler._json(200 if result["already_approved"] else 201, result)
            return
        with db.connect() as conn, conn.cursor() as cur:
            require_admin(cur, handler, user)
            if route == "/api/admin/logout":
                if handler.command != "POST":
                    fail(405, "Méthode non autorisée.")
                cur.execute("DELETE FROM shineray_console_sessions WHERE token_hash=%s", (admin_token_hash(cookie_token(handler)),))
                audit(cur, None, "logout")
                result, status = {"ok": True}, 200
            else:
                status, result = dispatch(cur, user, route, handler.command, body, query)
        cookie = f"{COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict" if route.endswith("/logout") else None
        handler._json(status, result, cookie=cookie)
    except (BrokenPipeError, ConnectionResetError):
        # Search plugins abort superseded requests; there is no client to reply to.
        return
    except db.AuthError as error:
        handler._json(error.status, {"error": error.message})
    except ValueError as error:
        handler._json(400, {"error": str(error)})
    except UniqueViolation:
        handler._json(409, {"error": "Cette référence ou ce code existe déjà."})
    except Exception as error:
        # Do not log passwords, customer records, SQL, or cookies.
        code = getattr(error, "sqlstate", None)
        print("Administration indisponible.", {"code": code if isinstance(code, str) and re.fullmatch(r"[A-Z0-9]{5}", code) else "unknown"})
        handler._json(503, {"error": "Administration temporairement indisponible. Aucun succès n’est confirmé ; actualisez avant de réessayer."})
