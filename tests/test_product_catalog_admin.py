"""Development-only catalog checks; all catalog changes are rolled back."""
import os
import unittest
import uuid
from unittest.mock import patch

import admin_api
import auth_backend as db
import product_catalog_admin as catalog_admin
import vip_purchases as vip
from psycopg.types.json import Jsonb


class ConfiguredCatalogTests(unittest.TestCase):
    class Cursor:
        def __init__(self, rows):
            self.rows = rows

        def execute(self, *_):
            pass

        def fetchall(self):
            return self.rows

    def test_empty_administration_does_not_publish_legacy_defaults(self):
        with patch("product_catalog_admin.initialized", return_value=False):
            self.assertEqual(vip.catalog(self.Cursor([]), configured_only=True), {})
            # Display changes do not change the existing purchase policy.
            self.assertEqual(set(vip.catalog(self.Cursor([]))), set(vip.DEFAULT_PRODUCTS))

    def test_all_configured_information_and_custom_codes_are_preserved(self):
        configured = [
            {"id": 91, "value": {**vip.DEFAULT_PRODUCTS["VIP1"], "name": "VIP1"}},
            {"id": 92, "value": {
                "code": "ATELIER_2026", "name": "NARKE Atelier – nom administrateur",
                "price": 7350, "durationDays": 65, "dailyIncome": 120,
                "totalIncome": 7800, "active": True,
            }},
        ]
        actual = vip.catalog(self.Cursor(configured), configured_only=True)
        self.assertEqual(list(actual), ["VIP1", "ATELIER_2026"])
        for row in configured:
            for key in ["code", "name", "price", "durationDays", "dailyIncome", "totalIncome", "active"]:
                self.assertEqual(actual[row["value"]["code"]][key], row["value"][key])
        self.assertTrue(actual["VIP1"]["purchasable"])
        self.assertFalse(actual["ATELIER_2026"]["purchasable"])
        configured[0]["value"]["active"] = False
        self.assertFalse(vip.catalog(self.Cursor(configured), configured_only=True)["VIP1"]["active"])
        self.assertEqual(vip.catalog(self.Cursor([]), configured_only=True), {})

    def test_public_endpoint_uses_only_configured_products(self):
        with patch("vip_purchases.db.connect") as connect, patch("vip_purchases.catalog", return_value={}) as catalog:
            cursor = connect.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
            self.assertEqual(vip.available()["products"], [])
            catalog.assert_called_once_with(cursor, configured_only=True)


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1", "Development DB opt-in")
class ProductCatalogAdminTests(unittest.TestCase):
    def test_public_information_follows_administrative_changes(self):
        code = "SYNC_" + uuid.uuid4().hex[:12].upper()
        with db.connect() as conn:
            try:
                with conn.cursor() as cur:
                    configured = dict(code=code, name="Nom configuré dans l’administration",
                                      price=7350, dailyIncome=120, totalIncome=7800, durationDays=65)
                    admin_api.resource_api(cur, None, "products", None, None, "POST", configured)
                    cur.execute("SELECT id FROM shineray_admin_resources WHERE kind='product' AND value->>'code'=%s", (code,))
                    ident = cur.fetchone()["id"]
                    for key, value in configured.items():
                        self.assertEqual(vip.catalog(cur, configured_only=True)[code][key], value)
                    changes = dict(name="Nom administrateur modifié", price=8100, durationDays=90)
                    admin_api.resource_api(cur, None, "products", ident, None, "PATCH", changes)
                    for key, value in changes.items():
                        self.assertEqual(vip.catalog(cur, configured_only=True)[code][key], value)
                    admin_api.resource_api(cur, None, "products", ident, None, "DELETE", {})
                    self.assertFalse(vip.catalog(cur, configured_only=True)[code]["active"])
                    admin_api.resource_api(cur, None, "products", ident, "permanent", "DELETE", {})
                    self.assertNotIn(code, vip.catalog(cur, configured_only=True))
            finally:
                conn.rollback()

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
