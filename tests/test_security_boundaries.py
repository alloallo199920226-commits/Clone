"""Development security regression checks; no live payment-provider requests."""
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
import customer_login_limits as limits
import sonarapay_payments as payments
from server import Handler


class PublicFileBoundaryTests(unittest.TestCase):
    def test_private_paths_and_security_headers(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            for path in ["/.env", "/.env.production", "/.git/config", "/server.py",
                         "/auth_backend.py", "/schema.sql", "/.replit", "/uv.lock",
                         "/generated-artifacts/administration-iveco-complete.zip",
                         "/attached_assets/aeronova-administration-complete_1792229186027.zip",
                         "/admin-ui/../server.py", "/pages/assets/%2e%2e/%2e%2e/server.py",
                         "/pages/assets/%2e%2e/%2e%2e/.env",
                         "/admin-ui/general.js/../../.env", "/.agents/memory/MEMORY.md"]:
                with self.subTest(path=path):
                    client = http.client.HTTPConnection("127.0.0.1", server.server_port)
                    client.request("GET", path)
                    response = client.getresponse()
                    self.assertEqual(response.status, 404)
                    self.assertEqual(response.getheader("X-Content-Type-Options").split(",")[0], "nosniff")
                    self.assertIn("object-src 'none'", response.getheader("Content-Security-Policy"))
                    self.assertNotIn("Python", response.getheader("Server"))
                    response.read()
                    client.close()
        finally:
            server.shutdown()
            server.server_close()


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1", "Development DB opt-in")
class FinancialSecurityTests(unittest.TestCase):
    def setUp(self):
        self.ids = []
        self.phones = []
        self.users = []
        for _ in range(2):
            phone = "9" + str(secrets.randbelow(10**7)).zfill(7)
            token, user, _ = db.register("+228", phone, "security-fixture-password")
            self.ids.append(user["id"])
            self.phones.append(phone)
            self.users.append((token, user))
        self.provider_patch = patch("sonarapay_payments.provider.request",
                                    side_effect=AssertionError("No live provider allowed"))
        self.provider_patch.start()
        self.addCleanup(self.provider_patch.stop)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM shineray_sonarapay_orders WHERE user_id=ANY(%s)", (self.ids,))
            cur.execute("DELETE FROM shineray_sessions WHERE user_id=ANY(%s)", (self.ids,))
            cur.execute("DELETE FROM shineray_transactions WHERE user_id=ANY(%s)", (self.ids,))
            cur.execute("DELETE FROM shineray_console_login_attempts WHERE client_hash=ANY(%s)",
                        ([limits.key("+228" + phone) for phone in self.phones],))
            for uid in reversed(self.ids):
                cur.execute("DELETE FROM shineray_users WHERE id=%s", (uid,))

    def request(self, path, payload=None, token=None, origin=True, method=None):
        client = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Cookie"] = "shineray_session=" + token
        if origin:
            headers["Origin"] = f"http://127.0.0.1:{self.server.server_port}"
        client.request(method or ("POST" if payload is not None else "GET"),
                       path, json.dumps(payload) if payload is not None else None, headers)
        response = client.getresponse()
        status, raw = response.status, response.read()
        client.close()
        return status, json.loads(raw)

    def test_customer_cannot_forge_credits_or_admin_privileges(self):
        token, user = self.users[0]
        paths = [
            ("/api/payments", {"kind": "recharge", "amount_fcfa": 99999999}),
            ("/api/demo-activity", {"kind": "recharge", "amount_fcfa": 99999999}),
            ("/api/admin/deposits", {"phone": user["phone"], "amount_fcfa": 99999999,
                                   "provider_reference": "forged", "receipt_verified": True}),
            ("/api/admin/users/%s/credit" % user["id"], {"amount": 99999999}),
            ("/api/manual-deposits", {"request_id": str(uuid.uuid4()), "channel_id": 1,
                                     "amount_fcfa": 3500, "phone": self.phones[0], "status": "approved"}),
            ("/api/missions/claim", {"mission_id": "invite-3", "amount_fcfa": 99999999}),
            ("/api/missions/claim", {"mission_id": "invite-3"}),
            ("/api/gift-codes/redeem", {"code": "NOT_A_VALID_GIFT_123456", "amount": 99999999}),
            ("/api/gift-codes/redeem", {"code": "NOT_A_VALID_GIFT_123456"}),
            ("/api/products/purchase", {"productCode": "VIP1", "expectedPrice": -4000,
                                       "requestId": str(uuid.uuid4())}),
            ("/api/auth/login", {"country_code": "+228", "phone": self.phones[0],
                                "password": "security-fixture-password", "is_admin": True}),
            ("/api/auth/register", {"country_code": "+228", "phone": self.phones[0],
                                   "password": "security-fixture-password", "balance_fcfa": 99999999}),
        ]
        for path, body in paths:
            with self.subTest(path=path, body_keys=sorted(body)):
                self.assertGreaterEqual(self.request(path, body, token)[0], 400)
        self.assertEqual(self.request("/api/admin/overview", token=token)[0], 401)
        self.assertEqual(self.request("/api/missions/claim", {"mission_id": "invite-3"}, token, origin=False)[0], 403)
        self.assertEqual(self.request("/api/missions/claim", {"mission_id": "invite-3"})[0], 401)
        self.assertEqual(db.account_summary(user["id"])["balance_fcfa"], 2300)
        self.assertEqual(len(db.get_activity(user["id"])), 1)

    def test_cannot_read_or_confirm_another_users_payment(self):
        token, user = self.users[0]
        with patch.object(payments.provider, "configured", return_value=True), patch.object(
                payments.provider, "fingerprint", return_value="0" * 64):
            order = payments.prepare(user, {"amount": 3500, "operatorId": "tmoney_tg",
                "phone": self.phones[0], "requestId": str(uuid.uuid4())})
        route = "/api/sonarapay/payments/" + str(order["id"])
        other_token = self.users[1][0]
        self.assertEqual(self.request(route, token=other_token)[0], 404)
        self.assertEqual(self.request(route, {"status": "successful", "credited": True}, other_token)[0], 404)
        self.assertEqual(self.request(route, {"status": "successful", "credited": True}, token)[0], 405)
        self.assertEqual(self.request(route + "/retry", {"status": "successful", "credited": True}, token)[0], 400)
        for uid in self.ids:
            self.assertEqual(db.account_summary(uid)["balance_fcfa"], 2300)

    def test_login_limit_is_committed_and_checked_before_password(self):
        phone = self.phones[0]
        for attempt in range(8):
            with self.assertRaises(db.AuthError) as refused:
                db.login("+228", phone, "incorrect-fixture-password")
            self.assertEqual(refused.exception.status, 429 if attempt == 7 else 401)
        # Even the right password must not be checked during the lockout.
        with patch.object(db.hashlib, "pbkdf2_hmac", side_effect=AssertionError("Throttle bypassed")):
            with self.assertRaises(db.AuthError) as refused:
                db.login("+228", phone, "security-fixture-password")
            self.assertEqual(refused.exception.status, 429)
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""UPDATE shineray_console_login_attempts SET
                locked_until=now()-interval '1 second',window_start=now()-interval '16 minutes'
                WHERE client_hash=%s""", (limits.key("+228" + phone),))
        token, user, _ = db.login("+228", phone, "security-fixture-password")
        self.assertTrue(token)
        self.assertEqual(user["id"], self.ids[0])
