"""Opt-in integration tests: all identities and writes belong to test fixtures."""

import concurrent.futures
import hashlib
import http.client
import json
import os
import secrets
import threading
import unittest
from http.server import ThreadingHTTPServer
from zipfile import ZipFile

import auth_backend
import admin_assets
from server import Handler


class QuietHandler(Handler):
    def log_message(self, *_args):
        pass


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1", "Development DB opt-in")
class ImportedAdminTests(unittest.TestCase):
    def setUp(self):
        self.users = []
        self.resources = []
        self.password = "isolated-admin-test-password"
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.actor, self.actor_cookie = self.member(admin=True)
        self.member_user, self.member_cookie = self.member()
        self.console_cookie = self.actor_cookie

    def tearDown(self):
        try:
            with auth_backend.connect() as conn, conn.cursor() as cur:
                for table in ("shineray_admin_vip_grants", "shineray_admin_operations", "shineray_admin_audit"):
                    cur.execute(f"DELETE FROM {table} WHERE admin_id=ANY(%s)", (self.users,))
                cur.execute("DELETE FROM shineray_first_deposits WHERE user_id=ANY(%s)", (self.users,))
                cur.execute("DELETE FROM shineray_deposit_approvals WHERE user_id=ANY(%s)", (self.users,))
                cur.execute("DELETE FROM shineray_transactions WHERE user_id=ANY(%s)", (self.users,))
                cur.execute("DELETE FROM shineray_admin_resources WHERE id=ANY(%s)", (self.resources,))
                for uid in reversed(self.users):
                    cur.execute("DELETE FROM shineray_users WHERE id=%s", (uid,))
        finally:
            self.httpd.shutdown()
            self.httpd.server_close()

    def member(self, admin=False):
        phone = "9" + "".join(str(secrets.randbelow(10)) for _ in range(7))
        token, user, _ = auth_backend.register("+228", phone, self.password)
        self.users.append(user["id"])
        if admin:
            with auth_backend.connect() as conn, conn.cursor() as cur:
                cur.execute("UPDATE shineray_users SET is_admin=true WHERE id=%s", (user["id"],))
        return user, "shineray_session=" + token

    def request(self, method, route, body=None, cookie=None, origin=True, raw=False):
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=15)
        headers = {"Cookie": cookie or self.console_cookie}
        if origin:
            headers["Origin"] = f"http://127.0.0.1:{self.httpd.server_port}"
        payload = None
        if body is not None:
            payload = json.dumps(body)
            headers["Content-Type"] = "application/json"
        connection.request(method, route, payload, headers)
        response = connection.getresponse()
        data = response.read()
        result = response.status, data if raw else json.loads(data), dict(response.getheaders())
        connection.close()
        return result

    def login(self):
        status, data, headers = self.request("POST", "/api/admin/login",
            {"path": "administration", "password": self.password})
        self.assertEqual(status, 200, data)
        self.assertIn("HttpOnly", headers["Set-Cookie"])
        self.assertIn("Secure", headers["Set-Cookie"])
        self.console_cookie = self.actor_cookie + "; " + headers["Set-Cookie"].split(";")[0]

    def create(self, route, body, result_key):
        status, data, _ = self.request("POST", "/api/admin/" + route, body)
        self.assertEqual(status, 201, data)
        result = data[result_key]
        self.resources.append(result["id"])
        return result

    def test_assets_are_identical_and_private_sources_are_unreachable(self):
        with ZipFile(admin_assets.ARCHIVE) as archive:
            for route, member in {
                "/administration": "administration/index.html",
                "/admin-ui/general.js": "administration/admin.js",
                "/admin-ui/styles.css": "administration/styles/admin.css",
                "/admin-ui/transaction-history.js": "administration/transaction-history.js",
            }.items():
                status, data, _ = self.request("GET", route, raw=True)
                self.assertEqual(status, 200)
                if route == "/administration":
                    self.assertIn(admin_assets.COMPAT_LINK, data)
                    data = data.replace(admin_assets.COMPAT_LINK, b"", 1)
                self.assertEqual(hashlib.sha256(data).digest(),
                                 hashlib.sha256(archive.read(admin_assets.PREFIX + member)).digest())
        for route in ("/server.js", "/admin_api.py", "/schema.sql", "/administration/index.html",
                      "/administration/admin.js", "/payments/routes.js",
                      "/attached_assets/aeronova-administration-complete_1792229186027.zip",
                      "/sprite-assets/../server.js", "/admin-ui/../../server.py"):
            self.assertEqual(self.request("GET", route, raw=True)[0], 404, route)

    def test_separate_auth_csrf_expiry_and_logout(self):
        self.assertEqual(self.request("GET", "/api/admin/overview", cookie=self.member_cookie)[0], 403)
        self.assertEqual(self.request("GET", "/api/admin/overview")[0], 401)
        self.assertEqual(self.request("POST", "/api/admin/login",
            {"path": "administration", "password": self.password}, origin=False)[0], 403)
        self.assertEqual(self.request("POST", "/api/admin/login",
            {"path": "administration", "password": "incorrect-password"})[0], 401)
        self.login()
        self.assertEqual(self.request("GET", "/api/admin/overview?summary=true")[0], 200)
        self.assertEqual(self.request("POST", "/api/admin/logout")[0], 200)
        self.assertEqual(self.request("GET", "/api/admin/overview")[0], 401)
        self.login()
        with auth_backend.connect() as conn, conn.cursor() as cur:
            cur.execute("UPDATE shineray_admin_sessions SET expires_at=now()-interval '1 minute' WHERE user_id=%s", (self.actor["id"],))
        self.assertEqual(self.request("GET", "/api/admin/overview")[0], 401)

    def test_failed_logins_are_counted_and_locked(self):
        for attempt in range(5):
            status, _, _ = self.request("POST", "/api/admin/login",
                {"path": "administration", "password": "incorrect-password"})
            self.assertEqual(status, 429 if attempt == 4 else 401)
        self.assertEqual(self.request("POST", "/api/admin/login",
            {"path": "administration", "password": self.password})[0], 429)

    def test_real_credit_debit_idempotency_search_and_history(self):
        self.login()
        uid = self.member_user["id"]
        base = f"/api/admin/users/{uid}"
        request_id = "test-credit-" + secrets.token_hex(8)
        body = {"amount": 100, "requestId": request_id}
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as workers:
            results = list(workers.map(lambda _: self.request("POST", base + "/credit", body)[0], range(2)))
        self.assertEqual(results, [200, 200])
        self.assertEqual(auth_backend.account_summary(uid)["balance_fcfa"], 2400)
        self.assertEqual(self.request("POST", base + "/credit", {**body, "amount": 101})[0], 409)
        self.assertEqual(self.request("POST", base + "/credit", body, cookie=self.member_cookie)[0], 403)
        self.assertEqual(self.request("POST", base + "/credit", {**body, "is_admin": True})[0], 400)
        self.assertEqual(self.request("POST", base + "/debit",
            {"amount": 2500, "requestId": "test-debit-" + secrets.token_hex(8)})[0], 409)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as workers:
            debits = list(workers.map(lambda _: self.request("POST", base + "/debit",
                {"amount": 1500, "requestId": "test-debit-" + secrets.token_hex(8)})[0], range(2)))
        self.assertEqual(sorted(debits), [200, 409])
        self.assertEqual(auth_backend.account_summary(uid)["balance_fcfa"], 900)
        self.assertEqual(self.request("GET", base)[1]["wallet"]["totalAdminCredits"], 100)
        status, found, _ = self.request("GET", "/api/admin/users/search?search=" + str(uid))
        self.assertEqual(status, 200)
        self.assertIn(uid, [user["id"] for user in found["users"]])
        self.assertEqual(self.request("GET", "/api/admin/transaction-history?cursor=bad")[0], 400)
        self.assertEqual(self.request("GET", "/api/admin/transaction-history?status=pending")[1]["total"], 0)
        self.assertEqual(self.request("GET", "/api/admin/popup-config")[1]["config"]["signupBonus"], 2300)
        self.assertEqual(self.request("PATCH", "/api/admin/popup-config", {"depositMin": 3000})[0], 409)
        self.assertEqual(self.request("PATCH", "/api/admin/payment-provider-controls", {"saspayEnabled": True})[0], 503)
        self.assertEqual(self.request("GET", "/api/admin/users-purge-preview")[0], 403)

    def test_resource_crud_grants_and_no_automatic_earnings(self):
        self.login()
        product = self.create("products", {"name": "Isolated test product", "price": 4000,
            "dailyIncome": 100, "totalIncome": 1000, "durationDays": 10}, "product")
        pid = product["id"]
        path = f"/api/admin/products/{pid}"
        self.assertEqual(self.request("PATCH", path, {"name": "Updated test product"})[0], 200)
        self.assertEqual(self.request("DELETE", path, {})[0], 200)
        self.assertEqual(self.request("PATCH", path + "/activate", {})[0], 200)
        grant_body = {"productId": pid, "requestId": "test-grant-" + secrets.token_hex(8)}
        grant_path = f"/api/admin/users/{self.member_user['id']}/grant-vip"
        grant = self.request("POST", grant_path, grant_body)
        self.assertEqual(grant[0], 200, grant[1])
        self.assertEqual(self.request("POST", grant_path, grant_body)[1], grant[1])
        self.assertEqual(self.request("DELETE", path + "/permanent", {})[0], 409)
        owned = auth_backend.get_products(self.member_user["id"])
        self.assertEqual(owned["products"][0]["amount_fcfa"], 0)
        self.assertEqual(owned["products"][0]["income_fcfa"], 0)
        self.assertEqual(auth_backend.account_summary(self.member_user["id"])["balance_fcfa"], 2300)
        self.assertEqual(self.request("POST", f"/api/admin/orders/{grant[1]['purchaseId']}/revoke-vip", {})[0], 200)
        self.assertEqual(auth_backend.get_products(self.member_user["id"])["quantity"], 0)
        gift = self.create("gift-codes", {"code": "", "amount": 500, "maxRedemptions": 1, "expiresInDays": 30}, "code")
        self.assertEqual(self.request("POST", "/api/admin/gift-codes",
            {"code": gift["code"], "amount": 500, "maxRedemptions": 1, "expiresInDays": 30})[0], 409)
        self.assertEqual(self.request("DELETE", f"/api/admin/gift-codes/{gift['id']}", {})[0], 200)
        self.assertNotIn(gift["id"], [r["id"] for r in self.request("GET", "/api/admin/gift-codes")[1]["codes"]])
        channel = self.create("payment-channels", {"country": "Togo", "countryCode": "+228",
            "operatorName": "Togocel", "receiverNumber": "91234567", "receiverName": "Isolated test only",
            "logoColor": "#009b72", "logoText": "TG", "logoUrl": "", "ussdTemplate": "*123*{amount}#"}, "channel")
        cpath = f"/api/admin/payment-channels/{channel['id']}"
        self.assertEqual(self.request("PATCH", cpath, {"isActive": False})[0], 200)
        self.assertEqual(self.request("DELETE", cpath, {})[0], 200)
        announcement = self.create("announcements", {"title": "Isolated test", "content": "Test only",
            "kind": "announcement", "audience": "all", "audienceLevel": ""}, "announcement")
        apath = f"/api/admin/announcements/{announcement['id']}"
        self.assertEqual(self.request("POST", apath + "/publish", {})[0], 200)
        self.assertEqual(self.request("PATCH", apath, {"title": "Cannot edit published"})[0], 409)
        self.assertEqual(self.request("POST", apath + "/withdraw", {})[0], 200)
        self.assertEqual(self.request("DELETE", apath, {})[0], 200)

    def test_original_history_escaped_query_filters_and_pagination(self):
        self.login()
        reference = "history-fixture-" + secrets.token_hex(8)
        for suffix in ("-first", "-second"):
            status, body, _ = self.request("POST", "/api/admin/deposits", {
                "phone": self.member_user["phone"], "amount_fcfa": 500,
                "provider_reference": reference + suffix, "receipt_verified": True,
            })
            self.assertEqual(status, 201, body)
        route = "/api/admin/transaction-history?type=deposit&amp;status=approved&amp;limit=1&amp;search="
        status, body, _ = self.request("GET", route + reference + "-first")
        self.assertEqual(status, 200, body)
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["transactions"][0]["reference"], "approved-deposit:" + reference + "-first")
        self.assertIsNone(body["nextCursor"])
        body = self.request("GET", route + reference)[1]
        self.assertEqual(body["total"], 2)
        self.assertIsNotNone(body["nextCursor"])
        next_page = self.request("GET", route + reference + "&amp;cursor=" + body["nextCursor"])[1]
        self.assertNotEqual(next_page["transactions"][0]["id"], body["transactions"][0]["id"])

    def test_banning_revokes_sessions_and_self_lockout_is_prevented(self):
        self.login()
        base = f"/api/admin/users/{self.member_user['id']}"
        self.assertEqual(self.request("POST", base + "/ban", {})[0], 200)
        self.assertEqual(self.request("GET", "/api/me", cookie=self.member_cookie)[0], 401)
        with self.assertRaises(auth_backend.AuthError):
            auth_backend.login("+228", self.member_user["phone"], self.password)
        self.assertEqual(self.request("POST", base + "/unban", {})[0], 200)
        self.assertEqual(self.request("GET", "/api/me", cookie=self.member_cookie)[0], 401)
        self.assertEqual(self.request("POST", f"/api/admin/users/{self.actor['id']}/ban", {})[0], 409)


if __name__ == "__main__":
    unittest.main()
