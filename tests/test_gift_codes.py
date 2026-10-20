"""Opt-in integration checks with temporary development accounts and codes."""
import concurrent.futures
import http.client
import json
import os
import secrets
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest.mock import patch

from psycopg.types.json import Jsonb
import auth_backend as db
from server import Handler


class QuietHandler(Handler):
    def log_message(self, *_):
        pass


@unittest.skipUnless(os.getenv("RUN_ACCOUNT_INTEGRATION_TESTS") == "1", "Development DB opt-in")
class GiftCodeTests(unittest.TestCase):
    def setUp(self):
        self.ids, self.gifts = [], []
        self.password = "temporary-gift-console-password"
        self.secret_patch = patch("admin_api.configured_password", return_value=self.password.encode())
        self.secret_patch.start()
        self.addCleanup(self.secret_patch.stop)
        import admin_api
        self.fixture_key = secrets.token_hex(12)
        original_audit = admin_api.audit
        audit_patch = patch("admin_api.audit", side_effect=lambda cur, actor, event, details=None:
            original_audit(cur, actor, event, {**(details or {}), "test_fixture": self.fixture_key}))
        audit_patch.start()
        self.addCleanup(audit_patch.stop)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        status, _, cookie = self.request("/api/admin/login",
                                         {"path": "omarshark-junior-panam", "password": self.password})
        self.assertEqual(status, 200)
        self.admin = cookie
        self.owner = self.member()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM shineray_transactions WHERE user_id=ANY(%s)", (self.ids,))
            cur.execute("DELETE FROM shineray_users WHERE id=ANY(%s)", (self.ids,))
            cur.execute("DELETE FROM shineray_admin_resources WHERE id=ANY(%s)", (self.gifts,))
            cur.execute("DELETE FROM shineray_admin_audit WHERE details->>'test_fixture'=%s",
                        (self.fixture_key,))
            cur.execute("DELETE FROM shineray_console_sessions WHERE token_hash=%s",
                        (__import__("admin_api").admin_token_hash(self.admin.split("=", 1)[1]),))

    def member(self):
        token, user, _ = db.register("+228", "9" + "".join(str(secrets.randbelow(10)) for _ in range(7)),
                                     "temporary-gift-user-password")
        self.ids.append(user["id"])
        return user["id"], "shineray_session=" + token

    def request(self, path, body=None, cookie="", method=None, origin=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
        headers = {"Content-Type": "application/json", "Cookie": cookie,
                   "Origin": origin or f"http://127.0.0.1:{self.server.server_port}"}
        conn.request(method or ("GET" if body is None else "POST"), path,
                     None if body is None else json.dumps(body), headers)
        response = conn.getresponse()
        data = json.loads(response.read())
        result = response.status, data, (response.getheader("Set-Cookie") or "").split(";")[0]
        conn.close()
        return result

    def create(self, amount=500, maximum=10):
        status, body, _ = self.request("/api/admin/gift-codes",
            {"code": "", "amount": amount, "maxRedemptions": maximum, "expiresInDays": 30}, self.admin)
        self.assertEqual(status, 201, body)
        self.gifts.append(body["code"]["id"])
        return body["code"]

    def redeem(self, gift, member=None, **kwargs):
        return self.request("/api/gift-codes/redeem", {"code": gift["code"]},
                            (member or self.owner)[1], **kwargs)

    def count(self, gift):
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*) n FROM shineray_gift_redemptions WHERE gift_id=%s", (gift["id"],))
            return cur.fetchone()["n"]

    def update(self, gift, **changes):
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("UPDATE shineray_admin_resources SET value=value||%s WHERE id=%s",
                        (Jsonb(changes), gift["id"]))

    def test_admin_generation_real_balance_and_safe_retry(self):
        gift = self.create()
        status, data, _ = self.request("/api/gift-codes/redeem",
            {"code": " " + gift["code"].lower() + " "}, self.owner[1])
        self.assertEqual(status, 200)
        self.assertFalse(data["alreadyRedeemed"])
        self.assertEqual(data["balance_fcfa"], 2800)
        self.assertTrue(self.redeem(gift)[1]["alreadyRedeemed"])
        self.assertEqual(db.account_summary(self.owner[0])["balance_fcfa"], 2800)
        self.assertEqual(self.count(gift), 1)
        codes = self.request("/api/admin/gift-codes", cookie=self.admin)[1]["codes"]
        self.assertEqual(next(c["redemptions"] for c in codes if c["id"] == gift["id"]), 1)
        history = db.get_activity(self.owner[0])
        rows = [t for t in history if t["label"] == "Bonus code cadeau"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["kind"], "bonus")

    def test_concurrent_same_account_never_double_credits(self):
        gift = self.create()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.redeem(gift), range(8)))
        self.assertTrue(all(r[0] == 200 for r in results), results)
        self.assertEqual(sum(not r[1]["alreadyRedeemed"] for r in results), 1)
        self.assertEqual(db.account_summary(self.owner[0])["balance_fcfa"], 2800)

    def test_last_global_use_is_shared_atomically(self):
        gift, other = self.create(maximum=1), self.member()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda member: self.redeem(gift, member), [self.owner, other]))
        self.assertEqual(sorted(r[0] for r in results), [200, 409])
        self.assertEqual(self.count(gift), 1)

    def test_expired_disabled_unknown_and_invalid_configuration(self):
        gift = self.create()
        self.update(gift, expiresAt="2000-01-01T00:00:00+00:00")
        self.assertEqual(self.redeem(gift)[0], 409)
        self.update(gift, expiresAt="2090-01-01T00:00:00+00:00", active=False)
        self.assertEqual(self.redeem(gift)[0], 409)
        self.update(gift, active=True, amount=True)
        self.assertEqual(self.redeem(gift)[0], 503)
        self.assertEqual(self.redeem({"code": "Z" * 32})[0], 404)
        self.assertEqual(self.count(gift), 0)

    def test_authentication_csrf_methods_and_amount_tampering(self):
        gift = self.create()
        self.assertEqual(self.request("/api/gift-codes/redeem", {"code": gift["code"]})[0], 401)
        self.assertEqual(self.request("/api/admin/gift-codes", {}, self.owner[1])[0], 401)
        self.assertEqual(self.redeem(gift, origin="https://untrusted.example")[0], 403)
        self.assertEqual(self.request("/api/gift-codes/redeem", cookie=self.owner[1])[0], 405)
        for body in ({}, {"code": "short"}, {"code": gift["code"], "amount": 999999},
                     {"code": gift["code"], "user_id": 1}, {"code": True}):
            self.assertEqual(self.request("/api/gift-codes/redeem", body, self.owner[1])[0], 400)
        self.assertEqual(self.count(gift), 0)

    def test_atomic_rollback_when_ledger_write_fails(self):
        gift = self.create()
        reference = f"gift-code:{gift['id']}:{self.owner[0]}"
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO shineray_transactions
                (user_id,kind,label,amount_fcfa,provider_reference)
                VALUES (%s,'bonus','Rollback fixture',1,%s)""", (self.owner[0], reference))
        self.assertEqual(self.redeem(gift)[0], 503)
        self.assertEqual(self.count(gift), 0)
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT value FROM shineray_admin_resources WHERE id=%s", (gift["id"],))
            self.assertEqual(cur.fetchone()["value"]["redemptions"], 0)
            cur.execute("DELETE FROM shineray_transactions WHERE provider_reference=%s", (reference,))
        self.assertEqual(self.redeem(gift)[0], 200)
        self.assertEqual(self.count(gift), 1)

    def test_different_codes_add_their_own_amounts_and_deleted_codes_stop(self):
        first, second, disabled = self.create(500), self.create(1000), self.create(800)
        self.assertEqual(self.redeem(first)[0], 200)
        self.assertEqual(self.redeem(second)[1]["balance_fcfa"], 3800)
        self.assertEqual(self.request(f"/api/admin/gift-codes/{disabled['id']}", {},
                                     self.admin, method="DELETE")[0], 200)
        self.assertEqual(self.redeem(disabled)[0], 409)

    def test_blocked_account_cannot_claim_a_bonus(self):
        gift = self.create()
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("UPDATE shineray_users SET is_blocked=true WHERE id=%s", (self.owner[0],))
        self.assertIn(self.redeem(gift)[0], (401, 403))
        self.assertEqual(self.count(gift), 0)
