"""Opt-in integration checks: RUN_ACCOUNT_INTEGRATION_TESTS=1 python3 -m unittest discover -s tests.

Uses temporary users in the development database and cleans them up.
"""
import http.client
import json
import os
import secrets
import threading
import unittest
from http.server import ThreadingHTTPServer

import auth_backend
from server import Handler


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1", "Development DB integration opt-in")
class AccountFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.user_ids = []
        cls.cookies = []

    @classmethod
    def tearDownClass(cls):
        try:
            with auth_backend.connect() as connection, connection.cursor() as cursor:
                for user_id in reversed(cls.user_ids):
                    cursor.execute("DELETE FROM shineray_transactions WHERE user_id = %s", (user_id,))
                    cursor.execute("DELETE FROM shineray_users WHERE id = %s", (user_id,))
        finally:
            cls.server.shutdown()
            cls.server.server_close()

    def request(self, method, path, payload=None, cookie=None, same_origin=True):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
        headers = {"Content-Type": "application/json"}
        if same_origin:
            headers["Origin"] = f"http://127.0.0.1:{self.server.server_port}"
        if cookie:
            headers["Cookie"] = cookie
        connection.request(method, path, json.dumps(payload) if payload is not None else None, headers)
        response = connection.getresponse()
        body = response.read()
        result = (response.status, dict(response.getheaders()), body)
        connection.close()
        return result

    def test_registration_and_login_for_added_countries(self):
        status, _, body = self.request("GET", "/api/countries")
        self.assertEqual(status, 200)
        eligible = {country["code"]: country for country in json.loads(body)["countries"]}
        for code, length in [("+229", 10), ("+226", 8), ("+227", 8), ("+237", 9)]:
            with self.subTest(country=code):
                self.assertEqual(eligible[code]["phone_length"], length)
                phone = ("01" if code == "+229" else "6") + "".join(
                    str(secrets.randbelow(10)) for _ in range(length - (2 if code == "+229" else 1)))
                status, _, body = self.request("POST", "/api/auth/register", {
                    "country_code": code, "phone": phone, "password": "integration-test-password",
                })
                self.assertEqual(status, 201, body)
                with auth_backend.connect() as connection, connection.cursor() as cursor:
                    cursor.execute("SELECT id FROM shineray_users WHERE phone=%s", (code + phone,))
                    self.user_ids.append(cursor.fetchone()["id"])
                status, headers, body = self.request("POST", "/api/auth/login", {
                    "country_code": code, "phone": code + phone, "password": "integration-test-password",
                })
                self.assertEqual(status, 200, body)
                self.assertIn("Set-Cookie", headers)

    def create_user(self, referral=""):
        phone = "9" + "".join(str(secrets.randbelow(10)) for _ in range(7))
        status, headers, body = self.request("POST", "/api/auth/register", {
            "country_code": "+228", "phone": phone, "password": "integration-test-password",
            "referral_code": referral,
        })
        self.assertEqual(status, 201, body)
        user = json.loads(body)["user"]
        self.user_ids.append(user["id"])
        cookie = headers["Set-Cookie"].split(";", 1)[0]
        self.assertIn("HttpOnly", headers["Set-Cookie"])
        self.assertIn("Secure", headers["Set-Cookie"])
        return user, cookie

    def test_full_account_referral_wallet_and_financial_isolation(self):
        _, first_cookie = self.create_user()
        status, _, body = self.request("GET", "/api/me", cookie=first_cookie)
        self.assertEqual(status, 200)
        summary = json.loads(body)
        self.assertEqual(summary["balance_fcfa"], 2300)
        self.assertNotIn("demo_balance_fcfa", summary)
        second, second_cookie = self.create_user(summary["referral_code"])
        _, _, body = self.request("GET", "/api/team", cookie=first_cookie)
        self.assertEqual(json.loads(body)["levels"], [1, 0, 0])
        self.assertEqual(json.loads(body)["revenue_fcfa"], 0)
        member = json.loads(body)["members"][0]
        self.assertEqual(member["level"], 1)
        self.assertIn("****", member["phone_masked"])
        self.assertNotIn(second["phone"], member["phone_masked"])
        status, _, _ = self.request("POST", "/api/wallets", {
            "provider": "TOGOCEL", "phone": "90123456",
        }, first_cookie)
        self.assertEqual(status, 400)
        for name in (" ", "x" * 121, "Bad\nName"):
            status, _, _ = self.request("POST", "/api/wallets", {
                "provider": "TOGOCEL", "phone": "90123456", "holder_name": name,
            }, first_cookie)
            self.assertEqual(status, 400)
        status, _, body = self.request("POST", "/api/wallets", {
            "provider": "TOGOCEL", "phone": "90123456", "holder_name": "  Titulaire  de test  ",
        }, first_cookie)
        self.assertEqual(status, 201, body)
        wallet_id = json.loads(body)["wallet"]["id"]
        self.assertEqual(json.loads(body)["wallet"]["holder_name"], "Titulaire de test")
        _, _, body = self.request("GET", "/api/wallets", cookie=first_cookie)
        self.assertEqual(json.loads(body)["wallets"][0]["holder_name"], "Titulaire de test")
        _, _, body = self.request("GET", "/api/wallets", cookie=second_cookie)
        self.assertEqual(json.loads(body)["wallets"], [])
        status, _, _ = self.request("DELETE", f"/api/wallets/{wallet_id}", cookie=second_cookie)
        self.assertEqual(status, 404)
        status, _, _ = self.request("DELETE", f"/api/wallets/{wallet_id}", cookie=first_cookie)
        self.assertEqual(status, 200)
        for endpoint in ("/api/demo-activity", "/api/payments"):
            status, _, _ = self.request("POST", endpoint, {
                "kind": "recharge", "amount_fcfa": 4000,
            }, first_cookie)
            self.assertEqual(status, 503)
        with auth_backend.connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO shineray_demo_activity (user_id, kind, label, amount_fcfa)
                   VALUES (%s, 'recharge', 'Legacy test simulation', 4000)""",
                (second["id"],),
            )
        _, _, body = self.request("GET", "/api/activity", cookie=second_cookie)
        self.assertEqual([row["kind"] for row in json.loads(body)["activities"]], ["bonus"])
        _, _, body = self.request("GET", "/api/me", cookie=second_cookie)
        self.assertEqual(json.loads(body)["balance_fcfa"], 2300)
        status, _, _ = self.request("POST", "/api/wallets", {
            "provider": "TOGOCEL", "phone": "90123456",
        }, first_cookie, same_origin=False)
        self.assertEqual(status, 403)
        status, _, _ = self.request("POST", "/api/auth/logout", {}, first_cookie)
        self.assertEqual(status, 200)
        status, _, _ = self.request("GET", "/api/me", cookie=first_cookie)
        self.assertEqual(status, 401)

    def test_page_protection_invalid_referral_and_assets(self):
        for route in ("/accueil", "/compte", "/notifications", "/a-propos", "/regles", "/mon-equipe"):
            status, headers, _ = self.request("GET", route)
            self.assertEqual(status, 302)
            self.assertEqual(headers["Location"], "/connexion")
        status, _, _ = self.request("GET", "/page_d_accueil_shineray/code.html")
        self.assertEqual(status, 404)
        status, _, body = self.request("GET", "/inscription?c=ABCDEFGH")
        self.assertEqual(status, 200)
        self.assertIn(b'name="referral_code"', body)
        status, _, _ = self.request("POST", "/api/auth/register", {
            "country_code": "+228", "phone": "90123456",
            "password": "integration-test-password", "referral_code": "INVALID999",
        })
        self.assertEqual(status, 400)
        for asset in ("about-fleet.jpg", "about-showroom.jpg", "rules-banner.jpg", "service-t30.jpg"):
            status, _, _ = self.request("GET", f"/pages/assets/{asset}")
            self.assertEqual(status, 200)

    def test_real_history_is_filtered_and_scoped_to_the_account(self):
        user, cookie = self.create_user()
        _, other_cookie = self.create_user()
        with auth_backend.connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO shineray_transactions
                   (user_id, kind, label, amount_fcfa, provider_reference)
                   VALUES (%s, 'recharge', 'Test de registre isolé', 4000, %s)""",
                (user["id"], "account-test-" + secrets.token_hex(16)),
            )
        status, _, body = self.request("GET", "/api/activity?kind=recharge", cookie=cookie)
        self.assertEqual(status, 200)
        activities = json.loads(body)["activities"]
        self.assertEqual(len(activities), 1)
        self.assertEqual(activities[0]["amount_fcfa"], 4000)
        self.assertEqual(activities[0]["label"], "Test de registre isolé")
        _, _, body = self.request("GET", "/api/activity?kind=withdrawal", cookie=cookie)
        self.assertEqual(json.loads(body)["activities"], [])
        _, _, body = self.request("GET", "/api/activity", cookie=other_cookie)
        self.assertEqual([row["kind"] for row in json.loads(body)["activities"]], ["bonus"])

    def test_receipts_owned_vips_and_team_use_only_account_facts(self):
        owner, cookie = self.create_user()
        _, _, body = self.request("GET", "/api/me", cookie=cookie)
        owner = json.loads(body)
        child, child_cookie = self.create_user(owner["referral_code"])
        _, _, body = self.request("GET", "/api/me", cookie=child_cookie)
        child = json.loads(body)
        grandchild, _ = self.create_user(child["referral_code"])
        entries = [
            (owner["id"], "recharge", "Dépôt vérifié", 8000, {"channel": "Recharger le canal 1"}),
            (owner["id"], "withdrawal", "Retrait vérifié", -2200, {"net_amount_fcfa": 1715}),
            (owner["id"], "purchase", "VIP2", -8000, {
                "vip": 2, "daily_income_fcfa": 2000, "total_income_fcfa": 360000,
                "validity_days": 180, "quantity": 1, "income_fcfa": 6000,
            }),
            (child["id"], "purchase", "VIP1", -4000, {"vip": 1}),
            (grandchild["id"], "purchase", "VIP2", -8000, {"vip": 2}),
            (owner["id"], "commission", "Commission niveau 1", 1480, {"source_user_id": child["id"]}),
            (owner["id"], "commission", "Commission niveau 2", 240, {"source_user_id": grandchild["id"]}),
        ]
        with auth_backend.connect() as connection, connection.cursor() as cursor:
            for user_id, kind, label, amount, details in entries:
                cursor.execute(
                    """INSERT INTO shineray_transactions
                       (user_id,kind,label,amount_fcfa,provider_reference,details)
                       VALUES (%s,%s,%s,%s,%s,%s::jsonb)""",
                    (user_id, kind, label, amount, "receipt-test-" + secrets.token_hex(12), json.dumps(details)),
                )
        status, _, body = self.request("GET", "/api/activity?kind=withdrawal", cookie=cookie)
        self.assertEqual(status, 200)
        receipt = json.loads(body)["activities"][0]
        self.assertEqual(receipt["amount_fcfa"], 2200)
        self.assertEqual(receipt["net_amount_fcfa"], 1715)
        self.assertEqual(receipt["status"], "succeeded")
        self.assertTrue(receipt["reference"].startswith("receipt-test-"))
        status, _, body = self.request("GET", "/api/products", cookie=cookie)
        self.assertEqual(status, 200)
        products = json.loads(body)
        self.assertEqual(products["quantity"], 1)
        self.assertEqual(products["income_fcfa"], 6000)
        self.assertEqual(products["products"][0]["vip"], 2)
        self.assertEqual(products["products"][0]["validity_days"], 180)
        _, _, body = self.request("GET", "/api/products", cookie=child_cookie)
        self.assertIsNone(json.loads(body)["income_fcfa"])
        self.assertIsNone(json.loads(body)["products"][0]["daily_income_fcfa"])
        _, _, body = self.request("GET", "/api/team", cookie=cookie)
        team = json.loads(body)
        self.assertEqual(team["levels"], [1, 1, 0])
        self.assertEqual(team["level_revenue_fcfa"], [1480, 240, 0])
        self.assertEqual(team["revenue_fcfa"], 1720)
        self.assertEqual([member["investment_fcfa"] for member in team["members"]], [4000, 8000])
        with auth_backend.connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO shineray_transactions
                   (user_id,kind,label,amount_fcfa,provider_reference)
                   VALUES (%s,'commission','Commission sans répartition',100,%s)""",
                (owner["id"], "unallocated-test-" + secrets.token_hex(12)),
            )
        _, _, body = self.request("GET", "/api/team", cookie=cookie)
        self.assertEqual(json.loads(body)["level_revenue_fcfa"], [None, None, None])
        self.assertEqual(json.loads(body)["revenue_fcfa"], 1820)
        self.assertEqual(self.request("GET", "/api/products")[0], 401)

    def test_history_limit_does_not_claim_the_list_is_finished(self):
        owner, cookie = self.create_user()
        with auth_backend.connect() as connection, connection.cursor() as cursor:
            cursor.executemany(
                """INSERT INTO shineray_transactions
                   (user_id,kind,label,amount_fcfa,provider_reference)
                   VALUES (%s,'recharge','Reçu de test isolé',%s,%s)""",
                [(owner["id"], 4000 + index, "limit-test-" + secrets.token_hex(12))
                 for index in range(105)],
            )
        status, _, body = self.request("GET", "/api/activity?kind=recharge", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["has_more"])
        self.assertEqual(len(json.loads(body)["activities"]), 100)
        self.assertEqual(json.loads(body)["activities"][0]["amount_fcfa"], 4104)
