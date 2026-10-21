"""Register the existing storefront defaults once, without overwriting overrides."""
from psycopg.types.json import Jsonb

EVENT = "catalog_defaults_registered"
LOCK_ID = 732684130


def initialized(cur):
    cur.execute("SELECT 1 FROM shineray_admin_audit WHERE event_type=%s LIMIT 1", (EVENT,))
    return bool(cur.fetchone())


def ensure_registered(cur):
    if initialized(cur):
        return
    cur.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK_ID,))
    if initialized(cur):
        return
    import admin_api
    from vip_purchases import DEFAULT_PRODUCTS
    cur.execute("SELECT value->>'code' AS code FROM shineray_admin_resources WHERE kind='product'")
    existing = {row["code"] for row in cur.fetchall()}
    for code, product in DEFAULT_PRODUCTS.items():
        if code in existing:
            continue
        cur.execute("""INSERT INTO shineray_admin_resources(kind,value)
                       VALUES ('product',%s) RETURNING id""", (Jsonb(product),))
        ident = cur.fetchone()["id"]
        admin_api.audit(cur, None, "create_product", {"id": ident, "source": "existing_storefront"})
    admin_api.audit(cur, None, EVENT)


def validate_code(cur, value, ident=None, prior=None):
    from vip_purchases import DEFAULT_PRODUCTS
    import auth_backend as db
    if prior and prior.get("code") in DEFAULT_PRODUCTS and value["code"] != prior["code"]:
        raise ValueError("Le code de ce produit VIP doit rester inchangé.")
    cur.execute("""SELECT id FROM shineray_admin_resources
                   WHERE kind='product' AND value->>'code'=%s AND (%s::bigint IS NULL OR id<>%s)
                   LIMIT 1""", (value["code"], ident, ident))
    if cur.fetchone():
        raise db.AuthError(409, "Ce code produit existe déjà. Modifiez le produit existant.")
