"""Real, atomic purchases using the settled account ledger, not a payment provider."""
import uuid

from psycopg.types.json import Jsonb

import auth_backend as db
from withdrawals import available_balance

# Prices of the existing six customer products; administrative settings override them.
DEFAULT_PRODUCTS = {
    f"VIP{level}": {"code": f"VIP{level}", "name": f"VIP{level}", "price": price,
                   "durationDays": 180, "dailyIncome": daily,
                   "totalIncome": daily * 180, "active": True}
    for level, (price, daily) in enumerate(
        ((4000, 1000), (8000, 2000), (15000, 3150), (40000, 8800), (80000, 18400), (120000, 28800)), 1)
}


def catalog(cursor, lock=False):
    from product_catalog_admin import initialized
    products = {} if initialized(cursor) else {code: dict(value) for code, value in DEFAULT_PRODUCTS.items()}
    cursor.execute("SELECT id,value FROM shineray_admin_resources WHERE kind='product' ORDER BY id"
                   + (" FOR SHARE" if lock else ""))
    seen = set()
    for row in cursor.fetchall():
        value = row["value"]
        code = value.get("code")
        if code not in DEFAULT_PRODUCTS:
            continue
        if code in seen:
            raise db.AuthError(503, "Plusieurs produits utilisent le même code VIP. Contactez l’administration.")
        seen.add(code)
        if (type(value.get("price")) is not int or not 1 <= value["price"] <= db.MAX_ACTIVITY_AMOUNT
                or type(value.get("durationDays")) is not int or not 1 <= value["durationDays"] <= 3650):
            raise db.AuthError(503, "Configuration du produit invalide.")
        products.setdefault(code, {"code": code}).update(price=value["price"], durationDays=value["durationDays"],
                              name=value.get("name") or code, active=value.get("active") is True,
                              product_id=row["id"])
        if (type(value.get("dailyIncome")) is not int or not 1 <= value["dailyIncome"] <= db.MAX_ACTIVITY_AMOUNT
                or type(value.get("totalIncome")) is not int
                or not value["dailyIncome"] <= value["totalIncome"] <= value["dailyIncome"] * value["durationDays"]):
            raise db.AuthError(503, "Revenus du produit non configurés ou incohérents dans l’administration.")
        products[code].update(dailyIncome=value["dailyIncome"], totalIncome=value["totalIncome"])
    return products


def available():
    with db.connect() as conn, conn.cursor() as cursor:
        return {"products": list(catalog(cursor).values()), "automaticIncomeEnabled": True}


def purchase(user_id, body):
    if not isinstance(body, dict) or set(body) != {"productCode", "requestId", "expectedPrice"}:
        raise ValueError("Champs d’achat invalides.")
    code = body["productCode"]
    if not isinstance(code, str) or code not in DEFAULT_PRODUCTS:
        raise ValueError("Produit VIP invalide.")
    try:
        request_id = str(uuid.UUID(str(body["requestId"])))
    except (ValueError, TypeError, AttributeError):
        raise ValueError("Identifiant d’achat invalide.") from None
    if type(body["expectedPrice"]) is not int or body["expectedPrice"] <= 0:
        raise ValueError("Prix invalide.")
    reference = f"vip:{user_id}:{request_id}"
    with db.connect() as conn, conn.cursor() as cursor:
        # Same lock as all existing balance writers: concurrent spending is serialized.
        cursor.execute("SELECT is_banned,is_blocked FROM shineray_users WHERE id=%s FOR NO KEY UPDATE", (user_id,))
        user = cursor.fetchone()
        if not user or user["is_banned"] or user["is_blocked"]:
            raise db.AuthError(403, "Compte indisponible pour cet achat.")
        cursor.execute("SELECT id,amount_fcfa,details FROM shineray_transactions WHERE provider_reference=%s",
                       (reference,))
        prior = cursor.fetchone()
        if prior:
            if prior["details"].get("product_code") != code or -prior["amount_fcfa"] != body["expectedPrice"]:
                raise db.AuthError(409, "Cet identifiant correspond à un autre achat.")
            transaction_id, price = prior["id"], -prior["amount_fcfa"]
        else:
            product = catalog(cursor, lock=True).get(code)
            if not product or not product["active"]:
                raise db.AuthError(409, "Ce produit n’est plus disponible.")
            price = product["price"]
            if body["expectedPrice"] != price:
                raise db.AuthError(409, "Le prix a changé. Rechargez la page avant de confirmer l’achat.")
            if available_balance(cursor, user_id) < price:
                raise db.AuthError(409, "Solde insuffisant pour acheter ce produit VIP.")
            details = {
                "product_code": code, "product_name": product["name"], "vip": int(code[3:]),
                "quantity": 1, "income_fcfa": 0, "validity_days": product["durationDays"],
                "daily_income_fcfa": product["dailyIncome"], "total_income_fcfa": product["totalIncome"],
                "automatic_income_enabled": True, "request_id": request_id,
            }
            if "product_id" in product:
                details["product_id"] = product["product_id"]
            cursor.execute("""INSERT INTO shineray_transactions
                (user_id,kind,label,amount_fcfa,provider_reference,details)
                VALUES (%s,'purchase',%s,%s,%s,%s) RETURNING *""",
                           (user_id, code, -price, reference, Jsonb(details)))
            purchase_row = cursor.fetchone()
            transaction_id = purchase_row["id"]
            import product_income
            product_income.enroll(cursor, purchase_row, product, product_income.activation(cursor))
        return {"ok": True, "purchaseId": transaction_id, "amount_fcfa": price,
                "balance_fcfa": available_balance(cursor, user_id), "automaticIncomeEnabled": True}
