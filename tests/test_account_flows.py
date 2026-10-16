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
        self.assertEqual(summary["balance_fcfa"], 0)
        self.assertNotIn("demo_balance_fcfa", summary)
        second, second_cookie = self.create_user(summary["referral_code"])
        _, _, body = self.request("GET", "/api/team", cookie=first_cookie)
        self.assertEqual(json.loads(body)["levels"], [1, 0, 0])
        self.assertEqual(json.loads(body)["revenue_fcfa"], 0)
        status, _, body = self.request("POST", "/api/wallets", {
            "provider": "TOGOCEL", "phone": "90123456",
        }, first_cookie)
        self.assertEqual(status, 201, body)
        wallet_id = json.loads(body)["wallet"]["id"]
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
        self.assertEqual(json.loads(body)["activities"], [])
        _, _, body = self.request("GET", "/api/me", cookie=second_cookie)
        self.assertEqual(json.loads(body)["balance_fcfa"], 0)
        status, _, _ = self.request("POST", "/api/wallets", {
            "provider": "TOGOCEL", "phone": "90123456",
        }, first_cookie, same_origin=False)
        self.assertEqual(status, 403)
        status, _, _ = self.request("POST", "/api/auth/logout", {}, first_cookie)
        self.assertEqual(status, 200)
        status, _, _ = self.request("GET", "/api/me", cookie=first_cookie)
        self.assertEqual(status, 401)

    def test_page_protection_invalid_referral_and_assets(self):
        for route in ("/accueil", "/compte", "/notifications", "/a-propos", "/regles"):
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
