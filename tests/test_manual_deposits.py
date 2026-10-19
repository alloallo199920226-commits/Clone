"""Development-only manual declarations and console decisions. No provider calls."""
import concurrent.futures
import http.client
import json
import os
import secrets
import threading
import unittest
import uuid
from http.server import ThreadingHTTPServer
from types import SimpleNamespace
from unittest.mock import patch

import admin_api
import auth_backend as db
import manual_deposits
from server import Handler


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1", "Development DB opt-in")
class ManualDepositTests(unittest.TestCase):
    def setUp(self):
        _, self.user, _ = db.register("+225", f"{secrets.randbelow(10**10):010d}", "manual-test-password")
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO shineray_admin_resources(kind,value) VALUES ('channel',%s::jsonb) RETURNING id""",
                        (json.dumps({"countryCode": "+225", "isActive": True, "operatorName": "Wave",
                                     "receiverName": "Fixture marchand", "receiverNumber": "0700000000"}),))
            self.channel = cur.fetchone()["id"]
        self.body = {"request_id": str(uuid.uuid4()), "channel_id": self.channel,
                     "amount_fcfa": 500, "phone": "0700000000"}
        self.handler = SimpleNamespace(headers={})
        self.provider = patch("sonarapay_client.configured", return_value=True)
        self.provider.start()
        self.addCleanup(self.provider.stop)

    def tearDown(self):
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""DELETE FROM shineray_admin_audit WHERE event_type='review_manual_deposit'
                AND (details->>'request_id')::bigint IN
                (SELECT id FROM shineray_manual_deposits WHERE user_id=%s)""", (self.user["id"],))
            cur.execute("""DELETE FROM shineray_admin_audit WHERE event_type='approve_deposit'
                AND (details->>'deposit_id')::bigint IN
                (SELECT id FROM shineray_deposit_approvals WHERE user_id=%s)""", (self.user["id"],))
            for table in ("shineray_manual_deposits", "shineray_first_deposits",
                          "shineray_deposit_approvals", "shineray_transactions"):
                cur.execute(f"DELETE FROM {table} WHERE user_id=%s", (self.user["id"],))
            cur.execute("DELETE FROM shineray_users WHERE id=%s", (self.user["id"],))
            cur.execute("DELETE FROM shineray_admin_resources WHERE id=%s", (self.channel,))

    def balance(self):
        return db.account_summary(self.user["id"])["balance_fcfa"]

    def test_submit_once_pending_admin_history_then_approve_once(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            results = list(pool.map(lambda _: manual_deposits.submit(self.user, self.body), range(3)))
        self.assertEqual(len({r["id"] for r in results}), 1)
        self.assertEqual(self.balance(), 2300)
        reference = results[0]["reference"]
        with db.connect() as conn, conn.cursor() as cur:
            history = admin_api.transaction_rows(cur, {"search": reference, "status": "pending"})
        self.assertEqual(history["total"], 1)
        self.assertEqual(history["transactions"][0]["paymentProvider"], "manual")
        self.assertEqual(history["transactions"][0]["status"], "pending")
        activities = db.get_activity(self.user["id"], "recharge")
        self.assertEqual(activities[0]["status"], "pending")
        request_id = int(results[0]["id"].split("-")[1])
        with self.assertRaises(db.AuthError):
            manual_deposits.review(self.handler, request_id, "approved")
        self.assertEqual(self.balance(), 2300)
        with patch.object(admin_api, "require_admin"):
            manual_deposits.review(self.handler, request_id, "approved")
            manual_deposits.review(self.handler, request_id, "approved")
            with self.assertRaises(db.AuthError):
                manual_deposits.review(self.handler, request_id, "rejected")
        self.assertEqual(self.balance(), 2800)
        self.assertEqual(db.get_activity(self.user["id"], "recharge")[0]["status"], "succeeded")
        with db.connect() as conn, conn.cursor() as cur:
            history = admin_api.transaction_rows(cur, {"search": reference})
        self.assertEqual(history["total"], 1)
        self.assertEqual(history["transactions"][0]["status"], "completed")

    def test_rejection_and_invalid_channels_never_credit(self):
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""UPDATE shineray_admin_resources SET value=value||'{"operatorName":"MTN"}'::jsonb WHERE id=%s""", (self.channel,))
        with self.assertRaises(ValueError):
            manual_deposits.submit(self.user, self.body)
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""UPDATE shineray_admin_resources SET value=value||'{"operatorName":"Wave"}'::jsonb WHERE id=%s""", (self.channel,))
        result = manual_deposits.submit(self.user, self.body)
        with self.assertRaises(db.AuthError):
            manual_deposits.submit(self.user, {**self.body, "amount_fcfa": 1000})
        with self.assertRaises(ValueError):
            manual_deposits.submit(self.user, {**self.body, "phone": "123"})
        with patch.object(admin_api, "require_admin"):
            manual_deposits.review(self.handler, int(result["id"].split("-")[1]), "rejected")
        self.assertEqual(self.balance(), 2300)
        self.assertEqual(db.get_activity(self.user["id"], "recharge")[0]["status"], "failed")

    def test_approval_failure_rolls_back_request_and_funds(self):
        result = manual_deposits.submit(self.user, self.body)
        audit = admin_api.audit
        def fail_after_settlement(cur, actor, event, details=None):
            if event == "review_manual_deposit":
                raise RuntimeError("simulated transaction interruption")
            return audit(cur, actor, event, details)
        with patch.object(admin_api, "require_admin"), patch.object(admin_api, "audit", side_effect=fail_after_settlement):
            with self.assertRaises(RuntimeError):
                manual_deposits.review(self.handler, int(result["id"].split("-")[1]), "approved")
        self.assertEqual(self.balance(), 2300)
        self.assertEqual(manual_deposits.submit(self.user, self.body)["status"], "pending")

    def test_http_submission_and_original_console_patch_contract(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        console_token = secrets.token_hex(24)
        console_hash = None
        def request(method, path, body=None, cookie=None):
            connection = http.client.HTTPConnection("127.0.0.1", server.server_port)
            headers = {"Origin": f"http://127.0.0.1:{server.server_port}", "Content-Type": "application/json"}
            if cookie:
                headers["Cookie"] = cookie
            try:
                connection.request(method, path, json.dumps(body) if body is not None else None, headers)
                response = connection.getresponse()
                return response.status, json.loads(response.read())
            finally:
                connection.close()
        try:
            with patch.object(admin_api, "configured_password", return_value=b"manual-http-console-test-key"):
                console_hash = admin_api.admin_token_hash(console_token)
                with db.connect() as conn, conn.cursor() as cur:
                    cur.execute("INSERT INTO shineray_console_sessions(token_hash,expires_at) VALUES (%s,now()+interval '5 minutes')", (console_hash,))
                status, _ = request("POST", "/api/manual-deposits", self.body)
                self.assertEqual(status, 401)
                with patch.object(db, "get_user_for_session", return_value=self.user):
                    status, payload = request("POST", "/api/manual-deposits", self.body)
                    self.assertEqual(status, 201, payload)
                path = "/api/admin/deposits/" + payload["deposit"]["id"]
                self.assertEqual(request("PATCH", path, {"status": "approved"})[0], 401)
                status, data = request("PATCH", path, {"status": "approved"},
                                       f"{admin_api.COOKIE}={console_token}")
                self.assertEqual(status, 200, data)
                self.assertEqual(self.balance(), 2800)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
            if console_hash:
                with db.connect() as conn, conn.cursor() as cur:
                    cur.execute("DELETE FROM shineray_console_sessions WHERE token_hash=%s", (console_hash,))
