"""Opt-in tests with isolated development users; no live funds or accounts."""
import concurrent.futures
import http.client
import json
import os
import secrets
import threading
import unittest
from http.server import ThreadingHTTPServer

import auth_backend
from deposit_settlement import settle_approved_deposit
from server import Handler


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1", "Development DB opt-in")
class FinancialPolicyTests(unittest.TestCase):
    def setUp(self):
        self.ids = []
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        try:
            with auth_backend.connect() as conn, conn.cursor() as cur:
                cur.execute("DELETE FROM shineray_first_deposits WHERE user_id=ANY(%s)", (self.ids,))
                cur.execute("DELETE FROM shineray_deposit_approvals WHERE user_id=ANY(%s)", (self.ids,))
                cur.execute("DELETE FROM shineray_transactions WHERE user_id=ANY(%s)", (self.ids,))
                for uid in reversed(self.ids):
                    cur.execute("DELETE FROM shineray_users WHERE id=%s", (uid,))
        finally:
            self.server.shutdown()
            self.server.server_close()

    def user(self, referral=""):
        token, user, _ = auth_backend.register("+228", "9" + "".join(str(secrets.randbelow(10)) for _ in range(7)),
                                               "financial-policy-test-password", referral)
        self.ids.append(user["id"])
        return auth_backend.account_summary(user["id"]), token

    def chain(self):
        users = []
        code = ""
        for _ in range(4):
            user, token = self.user(code)
            users.append((user, token))
            code = user["referral_code"]
        return users

    def request(self, path, token, payload=None, origin=True):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
        headers = {"Cookie": f"shineray_session={token}", "Content-Type": "application/json"}
        if origin:
            headers["Origin"] = f"http://127.0.0.1:{self.server.server_port}"
        conn.request("POST" if payload is not None else "GET", path,
                     json.dumps(payload) if payload is not None else None, headers)
        response = conn.getresponse()
        body = response.read()
        conn.close()
        return response.status, body

    def ledger(self, uid, kind):
        return [row for row in auth_backend.get_activity(uid) if row["kind"] == kind]

    def test_welcome_once_no_referral_for_signup_and_no_self_promotion(self):
        chain = self.chain()
        for user, token in chain:
            self.assertEqual(user["balance_fcfa"], 2300)
            self.assertEqual(len(self.ledger(user["id"], "bonus")), 1)
            self.assertEqual(self.ledger(user["id"], "commission"), [])
            auth_backend.login("+228", user["phone"], "financial-policy-test-password")
            self.assertEqual(auth_backend.account_summary(user["id"])["balance_fcfa"], 2300)
            self.assertEqual(self.request("/administration-depots", token)[0], 403)
            self.assertEqual(self.request("/api/admin/deposits", token, {
                "phone": user["phone"], "amount_fcfa": 500, "provider_reference": "spoof",
                "receipt_verified": True, "is_admin": True, "approval_method": "automatic"})[0], 403)

    def test_manual_first_approved_only_idempotency_minimum_and_origin(self):
        chain = self.chain()
        (admin, token), (level2, _), (level1, _), (child, _) = chain
        with auth_backend.connect() as conn, conn.cursor() as cur:
            cur.execute("UPDATE shineray_users SET is_admin=TRUE WHERE id=%s", (admin["id"],))
        body = {"phone": child["phone"], "amount_fcfa": 499,
                "provider_reference": "manual-" + secrets.token_hex(12), "receipt_verified": True}
        self.assertEqual(self.request("/api/admin/deposits", token, body)[0], 400)
        body["amount_fcfa"] = 500
        self.assertEqual(self.request("/api/admin/deposits", token, body, origin=False)[0], 403)
        self.assertEqual(self.request("/api/admin/deposits", token, {**body, "receipt_verified": False})[0], 400)
        status, result = self.request("/api/admin/deposits", token, body)
        self.assertEqual(status, 201, result)
        self.assertTrue(json.loads(result)["first_deposit"])
        for user, reward in [(admin, 5), (level2, 10), (level1, 200)]:
            self.assertEqual(auth_backend.account_summary(user["id"])["balance_fcfa"], 2300 + reward)
            self.assertEqual(self.ledger(user["id"], "commission")[0]["amount_fcfa"], reward)
        self.assertEqual(self.request("/api/admin/deposits", token, body)[0], 200)
        self.assertEqual(len(self.ledger(child["id"], "recharge")), 1)
        # Retry through the automatic service converges on the same deposit.
        result = settle_approved_deposit(child["id"], 500, body["provider_reference"], approval_method="automatic")
        self.assertTrue(result["already_approved"])
        status, result = self.request("/api/admin/deposits", token, {
            **body, "amount_fcfa": 1000, "provider_reference": "second-" + secrets.token_hex(12)})
        self.assertEqual(status, 201)
        self.assertFalse(json.loads(result)["first_deposit"])
        self.assertEqual(auth_backend.account_summary(child["id"])["balance_fcfa"], 3800)
        for user, _ in chain[:3]:
            self.assertEqual(len(self.ledger(user["id"], "commission")), 1)
        with self.assertRaises(ValueError):
            settle_approved_deposit(child["id"], 501, body["provider_reference"], approval_method="automatic")
        with self.assertRaises(auth_backend.AuthError):
            settle_approved_deposit(child["id"], 500, "forbidden", approval_method="manual", approved_by=child["id"])

    def test_automatic_rounding_pending_attempts_and_concurrent_first_deposits(self):
        chain = self.chain()
        child = chain[-1][0]
        prefix = secrets.token_hex(12)
        # A client payment request cannot credit funds or award commissions.
        self.assertEqual(self.request("/api/payments", chain[-1][1], {"kind": "recharge", "amount_fcfa": 500})[0], 503)
        self.assertEqual(self.ledger(child["id"], "recharge"), [])
        def approve(index):
            return settle_approved_deposit(child["id"], 501, f"{prefix}-{index}", approval_method="automatic")
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(approve, [1, 2]))
        self.assertEqual(sum(result["first_deposit"] for result in results), 1)
        for (user, _), expected in zip(chain[:3], [5, 10, 200]):
            self.assertEqual([row["amount_fcfa"] for row in self.ledger(user["id"], "commission")], [expected])
        self.assertEqual(len(self.ledger(child["id"], "recharge")), 2)
        # Concurrent duplicate callbacks must settle just once.
        other, _ = self.user()
        ref = "duplicate-" + prefix
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: settle_approved_deposit(
                other["id"], 500, ref, approval_method="automatic"), range(2)))
        self.assertEqual(sum(not result["already_approved"] for result in results), 1)
        self.assertEqual(auth_backend.account_summary(other["id"])["balance_fcfa"], 2800)

    def test_legacy_deposits_not_recommissioned_and_failed_settlement_rolls_back(self):
        parent, _ = self.user()
        child, _ = self.user(parent["referral_code"])
        ref = secrets.token_hex(12)
        with auth_backend.connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO shineray_transactions
                (user_id,kind,label,amount_fcfa,provider_reference)
                VALUES (%s,'recharge','Legacy approved',500,%s)""", (child["id"], ref))
        result = settle_approved_deposit(child["id"], 500, ref + "-new", approval_method="automatic")
        self.assertFalse(result["first_deposit"])
        self.assertEqual(self.ledger(parent["id"], "commission"), [])
        fresh, _ = self.user(parent["referral_code"])
        broken = "rollback-" + ref
        with auth_backend.connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO shineray_transactions
                (user_id,kind,label,amount_fcfa,provider_reference)
                VALUES (%s,'purchase','Conflict fixture',-4000,%s)""",
                (fresh["id"], "approved-deposit:" + broken))
        with self.assertRaises(Exception):
            settle_approved_deposit(fresh["id"], 500, broken, approval_method="automatic")
        with auth_backend.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*) AS count FROM shineray_deposit_approvals WHERE provider_reference=%s", (broken,))
            self.assertEqual(cur.fetchone()["count"], 0)
            cur.execute("SELECT count(*) AS count FROM shineray_first_deposits WHERE user_id=%s", (fresh["id"],))
            self.assertEqual(cur.fetchone()["count"], 0)
            cur.execute("DELETE FROM shineray_transactions WHERE provider_reference=%s", ("approved-deposit:" + broken,))
        self.assertEqual(self.ledger(parent["id"], "commission"), [])
        result = settle_approved_deposit(fresh["id"], 500, broken, approval_method="automatic")
        self.assertTrue(result["first_deposit"])
        self.assertEqual(len(self.ledger(parent["id"], "commission")), 1)
