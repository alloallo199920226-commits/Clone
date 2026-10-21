"""Opt-in: temporary development accounts only, never published funds."""
import concurrent.futures
import http.client
import json
import os
import secrets
import threading
import unittest
import uuid
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import auth_backend as db
import vip_purchases as vip
from server import Handler


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1", "Development DB opt-in")
class VipPurchasesTests(unittest.TestCase):
    def setUp(self):
        self.ids = []
        self.products = {key: dict(value) for key, value in vip.DEFAULT_PRODUCTS.items()}
        mock = patch("vip_purchases.catalog", return_value=self.products)
        mock.start()
        self.addCleanup(mock.stop)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.token, self.user = self.member()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM shineray_transactions WHERE user_id=ANY(%s)", (self.ids,))
            cur.execute("DELETE FROM shineray_users WHERE id=ANY(%s)", (self.ids,))

    def member(self):
        token, user, _ = db.register("+228", "9" + "".join(str(secrets.randbelow(10)) for _ in range(7)),
                                     "temporary-vip-test-password")
        self.ids.append(user["id"])
        return token, user

    def credit(self, amount=4000):
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO shineray_transactions
                (user_id,kind,label,amount_fcfa,provider_reference)
                VALUES (%s,'bonus','Test fixture',%s,%s)""",
                        (self.user["id"], amount, "vip-test:" + str(uuid.uuid4())))

    def body(self, **changes):
        return {"productCode": "VIP1", "expectedPrice": 4000, "requestId": str(uuid.uuid4()), **changes}

    def request(self, path, body=None, token=None, origin=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
        headers = {"Content-Type": "application/json",
                   "Origin": origin or f"http://127.0.0.1:{self.server.server_port}"}
        if token:
            headers["Cookie"] = f"shineray_session={token}"
        connection.request("GET" if body is None else "POST", path,
                           None if body is None else json.dumps(body), headers)
        response = connection.getresponse()
        result = (response.status, json.loads(response.read()))
        connection.close()
        return result

    def test_real_purchase_balance_products_and_history(self):
        self.credit()
        result = vip.purchase(self.user["id"], self.body())
        self.assertEqual(result["balance_fcfa"], 2300)
        self.assertTrue(result["automaticIncomeEnabled"])
        owned = db.get_products(self.user["id"])
        self.assertEqual(owned["quantity"], 1)
        self.assertEqual(owned["income_fcfa"], 0)
        self.assertEqual(owned["products"][0]["amount_fcfa"], 4000)
        self.assertEqual(owned["products"][0]["daily_income_fcfa"], 1000)
        self.assertTrue(owned["products"][0]["automatic_income_enabled"])
        self.assertIsNotNone(owned["products"][0]["next_income_at"])
        self.assertEqual(len(db.get_activity(self.user["id"], "purchase")), 1)

    def test_insufficient_tampered_and_inactive_never_debit(self):
        for body in [self.body(), self.body(expectedPrice=1), self.body(productCode="VIP99")]:
            with self.assertRaises((db.AuthError, ValueError)):
                vip.purchase(self.user["id"], body)
        self.credit()
        self.products["VIP1"]["active"] = False
        with self.assertRaises(db.AuthError):
            vip.purchase(self.user["id"], self.body())
        self.assertEqual(db.account_summary(self.user["id"])["balance_fcfa"], 6300)
        self.assertEqual(db.get_products(self.user["id"])["quantity"], 0)

    def test_same_request_concurrent_and_conflict(self):
        self.credit()
        body = self.body()
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            results = list(executor.map(lambda _: vip.purchase(self.user["id"], body), range(5)))
        self.assertEqual(len({row["purchaseId"] for row in results}), 1)
        self.assertEqual(db.account_summary(self.user["id"])["balance_fcfa"], 2300)
        with self.assertRaises(db.AuthError):
            vip.purchase(self.user["id"], {**body, "productCode": "VIP2"})

    def test_concurrent_distinct_purchases_cannot_overspend(self):
        self.credit()
        def buy(_):
            try:
                return vip.purchase(self.user["id"], self.body())["ok"]
            except db.AuthError:
                return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            self.assertEqual(sum(executor.map(buy, range(4))), 1)
        self.assertEqual(db.account_summary(self.user["id"])["balance_fcfa"], 2300)

    def test_multiple_intentional_purchases_and_server_price(self):
        self.credit(10000)
        self.products["VIP1"]["price"] = 4500
        with self.assertRaises(db.AuthError):
            vip.purchase(self.user["id"], self.body())
        for _ in range(2):
            vip.purchase(self.user["id"], self.body(expectedPrice=4500))
        self.assertEqual(db.account_summary(self.user["id"])["balance_fcfa"], 3300)
        self.assertEqual(db.get_products(self.user["id"])["quantity"], 2)

    def test_api_auth_origin_validation_and_user_isolation(self):
        path = "/api/products/purchase"
        self.assertEqual(self.request(path, self.body())[0], 401)
        self.assertEqual(self.request(path, self.body(), self.token, "https://foreign.example")[0], 403)
        self.assertEqual(self.request(path, {**self.body(), "user_id": 1}, self.token)[0], 400)
        self.credit()
        self.assertEqual(self.request("/api/products/catalog", token=self.token)[0], 200)
        self.assertEqual(self.request(path, self.body(), self.token)[0], 200)
        token, other = self.member()
        self.assertEqual(self.request("/api/products", token=token)[1]["quantity"], 0)
        self.assertEqual(db.account_summary(other["id"])["balance_fcfa"], 2300)
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("UPDATE shineray_users SET is_blocked=true WHERE id=%s", (self.user["id"],))
        with self.assertRaises(db.AuthError):
            vip.purchase(self.user["id"], self.body())


class CatalogTests(unittest.TestCase):
    def test_invalid_admin_income_is_not_replaced_with_an_advertised_default(self):
        from unittest.mock import Mock
        for changes in [{"dailyIncome": None}, {"dailyIncome": 0}, {"dailyIncome": True},
                        {"totalIncome": 200001}, {"totalIncome": 0}]:
            cursor = Mock()
            cursor.fetchall.return_value = [{"id": 123, "value": {
                "code": "VIP1", "name": "VIP1", "price": 4000, "durationDays": 200,
                "dailyIncome": 1000, "totalIncome": 200000, "active": True, **changes}}]
            with self.subTest(changes=changes), self.assertRaises(db.AuthError):
                vip.catalog(cursor)

    def test_saved_admin_settings_override_defaults(self):
        from unittest.mock import Mock
        cursor = Mock()
        cursor.fetchone.return_value = None  # Catalog has not yet been registered.
        cursor.fetchall.return_value = [{"id": 123, "value": {
            "code": "VIP1", "name": "VIP1", "price": 4100, "durationDays": 200, "active": False,
            "dailyIncome": 900, "totalIncome": 180000}}]
        actual = vip.catalog(cursor)
        self.assertEqual(actual["VIP1"]["price"], 4100)
        self.assertFalse(actual["VIP1"]["active"])
        self.assertEqual(actual["VIP1"]["dailyIncome"], 900)
        self.assertEqual(actual["VIP2"]["price"], 8000)
