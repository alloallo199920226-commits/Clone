"""Development-only catalog checks; all catalog changes are rolled back."""
import os
import unittest

import admin_api
import auth_backend as db
import product_catalog_admin as catalog_admin
import vip_purchases as vip
from psycopg.types.json import Jsonb


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1", "Development DB opt-in")
class ProductCatalogAdminTests(unittest.TestCase):
    def test_register_modify_disable_reactivate_delete_without_resurrection(self):
        with db.connect() as conn:
            try:
                with conn.cursor() as cur:
                    catalog_admin.ensure_registered(cur)
                    rows = {p["code"]: p for p in admin_api.resources(cur, "product")}
                    self.assertTrue(set(vip.DEFAULT_PRODUCTS) <= set(rows))
                    before = {code: p["id"] for code, p in rows.items()}
                    catalog_admin.ensure_registered(cur)
                    self.assertEqual(before, {p["code"]: p["id"] for p in admin_api.resources(cur, "product")})
                    product = rows["VIP1"]
                    changes = dict(name="VIP1 modifié", price=4100, dailyIncome=1100,
                                   totalIncome=198000, durationDays=180)
                    status, _ = admin_api.resource_api(cur, None, "products", product["id"], None, "PATCH", changes)
                    self.assertEqual(status, 200)
                    terms = vip.catalog(cur)["VIP1"]
                    for key, value in changes.items():
                        self.assertEqual(terms[key], value)
                    admin_api.resource_api(cur, None, "products", product["id"], None, "DELETE", {})
                    self.assertFalse(vip.catalog(cur)["VIP1"]["active"])
                    catalog_admin.ensure_registered(cur)
                    self.assertFalse(vip.catalog(cur)["VIP1"]["active"])
                    admin_api.resource_api(cur, None, "products", product["id"], "activate", "PATCH", {})
                    self.assertTrue(vip.catalog(cur)["VIP1"]["active"])
                    with self.assertRaises(db.AuthError):
                        admin_api.resource_api(cur, None, "products", None, None, "POST",
                                               {**changes, "code": "VIP1"})
                    with self.assertRaises(ValueError):
                        admin_api.resource_api(cur, None, "products", product["id"], None, "PATCH",
                                               {"code": "VIP9"})
                    # Replace VIP6 only inside this rolled-back transaction, so
                    # permanent deletion never targets an existing purchased VIP.
                    cur.execute("SELECT value FROM shineray_admin_resources WHERE id=%s", (rows["VIP6"]["id"],))
                    snapshot = cur.fetchone()["value"]
                    cur.execute("UPDATE shineray_admin_resources SET value=%s WHERE id=%s",
                                (Jsonb({**snapshot, "code": "TEMP_VIP6"}), rows["VIP6"]["id"]))
                    cur.execute("""INSERT INTO shineray_admin_resources(kind,value)
                                   VALUES ('product',%s) RETURNING id""",
                                (Jsonb(vip.DEFAULT_PRODUCTS["VIP6"]),))
                    fixture_id = cur.fetchone()["id"]
                    admin_api.resource_api(cur, None, "products", fixture_id, "permanent", "DELETE", {})
                    self.assertNotIn("VIP6", vip.catalog(cur))
                    catalog_admin.ensure_registered(cur)
                    self.assertNotIn("VIP6", vip.catalog(cur))
            finally:
                conn.rollback()

    def test_registration_preserves_existing_configuration(self):
        with db.connect() as conn:
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT id,value FROM shineray_admin_resources WHERE kind='product' AND value->>'code'='VIP1'")
                    existing = cur.fetchone()
                    if existing:
                        snapshot, ident = existing["value"], existing["id"]
                    else:
                        snapshot = {**vip.DEFAULT_PRODUCTS["VIP1"], "price": 5555, "name": "Configuration existante"}
                        cur.execute("INSERT INTO shineray_admin_resources(kind,value) VALUES ('product',%s) RETURNING id",
                                    (Jsonb(snapshot),))
                        ident = cur.fetchone()["id"]
                    catalog_admin.ensure_registered(cur)
                    cur.execute("SELECT value FROM shineray_admin_resources WHERE id=%s", (ident,))
                    self.assertEqual(cur.fetchone()["value"], snapshot)
            finally:
                conn.rollback()
