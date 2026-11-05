"""Owner reset end-to-end on an isolated disposable schema, never real customers."""
import concurrent.futures
import http.client
import json
import os
from pathlib import Path
import threading
import unittest
import uuid
from http.server import ThreadingHTTPServer
from unittest.mock import patch

from psycopg import sql

import admin_api
import admin_assets
import auth_backend as db
import customer_reset
from server import Handler


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1",
                     "Development DB opt-in")
class AdminCustomerResetTests(unittest.TestCase):
    def setUp(self):
        self.schema = "reset_test_" + uuid.uuid4().hex
        self.real_connect = db.connect
        with self.real_connect() as conn, conn.cursor() as cur:
            cur.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(self.schema)))
            cur.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(self.schema)))
            cur.execute(Path("schema.sql").read_text())
        self.addCleanup(self.drop_schema)

        def isolated_connect():
            conn = self.real_connect()
            conn.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(self.schema)))
            conn.commit()
            return conn

        connection_patch = patch("auth_backend.connect", side_effect=isolated_connect)
        connection_patch.start()
        self.addCleanup(connection_patch.stop)
        password_patch = patch("admin_api.configured_password",
                               return_value=b"isolated-owner-reset-password")
        password_patch.start()
        self.addCleanup(password_patch.stop)
        self.member_token, self.member, _ = db.register("+228", "90000001", "isolated-test-password")
        _, self.other, _ = db.register("+228", "90000002", "isolated-test-password")
        _, self.admin, _ = db.register("+228", "90000003", "isolated-test-password")
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("UPDATE shineray_users SET is_admin=true WHERE id=%s", (self.admin["id"],))
            cur.execute("""INSERT INTO shineray_admin_resources(kind,value)
                VALUES ('product','{"code":"VIP1","price":4000}'),
                ('channel','{"setting":"keep"}'),('announcement','{"setting":"keep"}')""")
            cur.execute("INSERT INTO shineray_income_policy(id) VALUES (1)")
            cur.execute("""INSERT INTO shineray_wallets(user_id,provider,phone,holder_name)
                VALUES (%s,'TOGOCEL','+22890000001','Fixture') RETURNING id""", (self.member["id"],))
            wallet = cur.fetchone()["id"]
            cur.execute("""INSERT INTO shineray_withdrawal_requests
                (request_id,user_id,wallet_id,amount_fcfa,fee_fcfa,net_amount_fcfa,wallet_snapshot)
                VALUES (%s,%s,%s,1500,300,1200,'{}')""",
                (uuid.uuid4(), self.member["id"], wallet))
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.addCleanup(self.httpd.server_close)
        self.addCleanup(self.httpd.shutdown)
        self.cookie = ""
        status, _, cookie = self.request("POST", "/api/admin/login", {
            "path": admin_assets.ADMIN_PATH, "password": "isolated-owner-reset-password"})
        self.assertEqual(status, 200)
        self.cookie = cookie.split(";")[0]

    def drop_schema(self):
        with self.real_connect() as conn:
            conn.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(self.schema)))

    def request(self, method, route, body=None, *, cookie=None, origin=True):
        client = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=20)
        headers = {"Cookie": self.cookie if cookie is None else cookie}
        if origin:
            headers["Origin"] = f"http://127.0.0.1:{self.httpd.server_port}"
        if body is not None:
            headers["Content-Type"] = "application/json"
        client.request(method, route, json.dumps(body) if body is not None else None, headers)
        response = client.getresponse()
        status, result, cookie = response.status, json.loads(response.read()), response.getheader("Set-Cookie", "")
        client.close()
        return status, result, cookie

    def body(self):
        status, result, _ = self.request("GET", "/api/admin/customer-reset/preview")
        self.assertEqual(status, 200)
        self.assertEqual(result["customer_count"], 2)
        self.assertEqual(result["pending_withdrawals"], 1)
        return {"preview_token": result["preview_token"],
                "password": "isolated-owner-reset-password",
                "confirmation": customer_reset.CONFIRMATION, "backup_confirmed": True}

    def count(self, table):
        with db.connect() as conn:
            return conn.execute(sql.SQL("SELECT count(*) n FROM {}").format(
                sql.Identifier(table))).fetchone()["n"]

    def test_deletion_idempotency_preservation_and_new_registration(self):
        body = self.body()
        _, newcomer, _ = db.register("+228", "90000004", "isolated-test-password")
        with db.connect() as conn:
            conn.execute("UPDATE shineray_users SET referred_by=%s WHERE id=%s",
                         (self.member["id"], newcomer["id"]))
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.request(
                "POST", "/api/admin/customer-reset", body), range(2)))
        self.assertEqual([r[0] for r in results], [200, 200], results)
        self.assertEqual(sorted(r[1]["already_completed"] for r in results), [False, True])
        self.assertEqual(results[0][1]["deleted_customers"], 2)
        self.assertEqual(self.count("shineray_users"), 2)
        self.assertEqual(self.count("shineray_transactions"), 2)  # Admin + newcomer welcome.
        self.assertEqual(self.count("shineray_wallets"), 0)
        self.assertEqual(self.count("shineray_withdrawal_requests"), 0)
        self.assertEqual(self.count("shineray_admin_resources"), 3)
        self.assertEqual(self.count("shineray_income_policy"), 1)
        self.assertEqual(self.count("shineray_console_sessions"), 1)
        with db.connect() as conn:
            self.assertIsNone(conn.execute("SELECT referred_by FROM shineray_users WHERE id=%s",
                                           (newcomer["id"],)).fetchone()["referred_by"])
        self.assertEqual(self.request("GET", "/api/admin/overview")[0], 200)
        self.assertEqual(self.request("GET", "/api/me",
                                     cookie="shineray_session=" + self.member_token)[0], 401)

    def test_auth_csrf_confirmation_and_token_guards(self):
        body = self.body()
        for cookie in ("", "shineray_session=" + self.member_token):
            self.assertEqual(self.request("GET", "/api/admin/customer-reset/preview", cookie=cookie)[0], 401)
            self.assertEqual(self.request("POST", "/api/admin/customer-reset", body, cookie=cookie)[0], 401)
        self.assertEqual(self.request("POST", "/api/admin/customer-reset", body, origin=False)[0], 403)
        for changes in ({"confirmation": "oui"}, {"backup_confirmed": False},
                        {"preview_token": body["preview_token"] + "x"}):
            self.assertEqual(self.request("POST", "/api/admin/customer-reset",
                                          {**body, **changes})[0], 400)
        self.assertEqual(self.request("POST", "/api/admin/customer-reset",
                                      {**body, "password": "incorrect"})[0], 401)
        self.assertEqual(self.count("shineray_users"), 3)
        self.assertEqual(self.count("shineray_withdrawal_requests"), 1)
        with patch("customer_reset.time.time", return_value=9999999999):
            self.assertEqual(self.request("POST", "/api/admin/customer-reset", body)[0], 410)
        self.assertEqual(self.count("shineray_users"), 3)

    def test_failed_audit_rolls_back_every_deletion(self):
        body = self.body()
        original_audit = admin_api.audit

        def fail_reset(cur, actor, event, details=None):
            if event == "customer_reset":
                raise RuntimeError("fixture rollback")
            return original_audit(cur, actor, event, details)

        with patch("admin_api.audit", side_effect=fail_reset):
            self.assertEqual(self.request("POST", "/api/admin/customer-reset", body)[0], 503)
        self.assertEqual(self.count("shineray_users"), 3)
        self.assertEqual(self.count("shineray_transactions"), 3)
        self.assertEqual(self.count("shineray_withdrawal_requests"), 1)
        self.assertEqual(self.request("POST", "/api/admin/customer-reset", body)[0], 200)

    def test_password_attempt_limit_is_persistent(self):
        body = {**self.body(), "password": "incorrect"}
        for attempt in range(5):
            self.assertEqual(self.request("POST", "/api/admin/customer-reset", body)[0],
                             429 if attempt == 4 else 401)
        body["password"] = "isolated-owner-reset-password"
        self.assertEqual(self.request("POST", "/api/admin/customer-reset", body)[0], 429)
        self.assertEqual(self.count("shineray_users"), 3)
