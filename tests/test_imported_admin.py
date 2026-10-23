"""Opt-in integration tests: all identities and writes belong to test fixtures."""

import concurrent.futures
import hashlib
import http.client
import json
import os
import secrets
import threading
import unittest
import uuid
from unittest.mock import patch
from types import SimpleNamespace
from http.server import ThreadingHTTPServer
from zipfile import ZipFile
from psycopg.types.json import Jsonb

import auth_backend
import admin_assets
import admin_api
from server import Handler


class QuietHandler(Handler):
    def log_message(self, *_args):
        pass


class AdminPasswordConfigurationTests(unittest.TestCase):
    def test_absent_or_weak_password_never_falls_back(self):
        for value in ("", "too-short", "x" * 257):
            with self.subTest(length=len(value)), patch("admin_api.os.getenv", return_value=value):
                with self.assertRaises(auth_backend.AuthError) as error:
                    admin_api.configured_password()
                self.assertEqual(error.exception.status, 503)

    def test_valid_password_is_server_only_configuration(self):
        with patch("admin_api.os.getenv", return_value="isolated-config-password"):
            self.assertEqual(admin_api.configured_password(), b"isolated-config-password")


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1", "Development DB opt-in")
class ImportedAdminTests(unittest.TestCase):
    def setUp(self):
        self.users = []
        self.resources = []
        self.password = "isolated-admin-test-password"
        self.admin_password = "isolated-console-" + secrets.token_hex(12)
        self.password_patch = patch("admin_api.configured_password", return_value=self.admin_password.encode())
        self.configured_password = self.password_patch.start()
        self.addCleanup(self.password_patch.stop)
        self.fixture_key = secrets.token_hex(12)
        original_audit = admin_api.audit
        self.audit_patch = patch("admin_api.audit", side_effect=lambda cur, actor, event, details=None:
            original_audit(cur, actor, event, {**(details or {}), "test_fixture": self.fixture_key}))
        self.audit_patch.start()
        self.addCleanup(self.audit_patch.stop)
        self.console_tokens = []
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.actor, self.actor_cookie = self.member()
        self.member_user, self.member_cookie = self.member()
        self.console_cookie = ""

    def tearDown(self):
        try:
            with auth_backend.connect() as conn, conn.cursor() as cur:
                for table in ("shineray_admin_vip_grants", "shineray_admin_operations", "shineray_admin_audit"):
                    if table == "shineray_admin_audit":
                        cur.execute(f"DELETE FROM {table} WHERE details->>'test_fixture'=%s", (self.fixture_key,))
                    else:
                        cur.execute(f"DELETE FROM {table} WHERE user_id=ANY(%s)", (self.users,))
                for token_hash in self.console_tokens:
                    cur.execute("DELETE FROM shineray_console_sessions WHERE token_hash=%s",
                                (token_hash,))
                cur.execute("DELETE FROM shineray_console_login_attempts WHERE client_hash=%s",
                            (admin_api.admin_console_auth.client_key(
                                SimpleNamespace(client_address=("127.0.0.1", 0)), self.admin_password.encode()),))
                cur.execute("DELETE FROM shineray_first_deposits WHERE user_id=ANY(%s)", (self.users,))
                cur.execute("DELETE FROM shineray_deposit_approvals WHERE user_id=ANY(%s)", (self.users,))
                cur.execute("DELETE FROM shineray_withdrawal_requests WHERE user_id=ANY(%s)", (self.users,))
                cur.execute("DELETE FROM shineray_transactions WHERE user_id=ANY(%s)", (self.users,))
                cur.execute("DELETE FROM shineray_admin_resources WHERE id=ANY(%s)", (self.resources,))
                for uid in reversed(self.users):
                    cur.execute("DELETE FROM shineray_users WHERE id=%s", (uid,))
        finally:
            self.httpd.shutdown()
            self.httpd.server_close()

    def member(self, admin=False, referral_code=""):
        phone = "9" + "".join(str(secrets.randbelow(10)) for _ in range(7))
        token, user, _ = auth_backend.register("+228", phone, self.password, referral_code)
        self.users.append(user["id"])
        if admin:
            with auth_backend.connect() as conn, conn.cursor() as cur:
                cur.execute("UPDATE shineray_users SET is_admin=true WHERE id=%s", (user["id"],))
        return user, "shineray_session=" + token

    def request(self, method, route, body=None, cookie=None, origin=True, raw=False):
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=15)
        headers = {"Cookie": self.console_cookie if cookie is None else cookie}
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
        if response.status == 200 and route == "/api/admin/login":
            token = result[2]["Set-Cookie"].split(";")[0].split("=", 1)[1]
            self.console_tokens.append(admin_api.admin_token_hash(token))
        connection.close()
        return result

    def login(self):
        status, data, headers = self.request("POST", "/api/admin/login",
            {"path": admin_assets.ADMIN_PATH, "password": self.admin_password})
        self.assertEqual(status, 200, data)
        self.assertIn("HttpOnly", headers["Set-Cookie"])
        self.assertIn("Secure", headers["Set-Cookie"])
        self.console_cookie = headers["Set-Cookie"].split(";")[0]

    def create(self, route, body, result_key):
        status, data, _ = self.request("POST", "/api/admin/" + route, body)
        self.assertEqual(status, 201, data)
        result = data[result_key]
        self.resources.append(result["id"])
        return result

    def test_today_withdrawals_use_morocco_activity_and_do_not_duplicate(self):
        self.login()
        marker = "today-withdrawals-" + self.fixture_key
        members = {name: self.member()[0] for name in
                   ("purchase", "commission", "both", "yesterday", "tomorrow", "bonus")}
        with auth_backend.connect() as conn, conn.cursor() as cur:
            for name, member in members.items():
                uid = member["id"]
                kinds = ("purchase", "commission") if name == "both" else (
                    "commission" if name == "commission" else "bonus" if name == "bonus" else "purchase",)
                day = -1 if name == "yesterday" else 1 if name == "tomorrow" else 0
                for kind in kinds:
                    cur.execute("""INSERT INTO shineray_transactions
                        (user_id,kind,label,amount_fcfa,provider_reference,details,created_at)
                        VALUES (%s,%s,'Fixture activité',%s,%s,'{"vip":1}',
                          ((now() AT TIME ZONE 'Africa/Casablanca')::date + %s)::timestamp
                            AT TIME ZONE 'Africa/Casablanca')""",
                        (uid, kind, -3500 if kind == "purchase" else 100,
                         marker + name + kind, day))
                for status in ("pending", "rejected"):
                    cur.execute("""INSERT INTO shineray_withdrawal_requests
                        (user_id,request_id,wallet_id,amount_fcfa,fee_fcfa,net_amount_fcfa,wallet_snapshot,status,created_at)
                        VALUES (%s,%s,0,2300,460,1840,%s,%s,now()-interval '2 days')""",
                        (uid, str(uuid.uuid4()), Jsonb({"destination":"fixture",
                         "receiver_name":"Fixture", "channel":"WAVE"}), status))
            ids = [member["id"] for member in members.values()]
            result = admin_api.transaction_rows(cur, {"type":"withdrawal", "status":"pending"}, True)
            rows = [row for row in result["transactions"] if row["userId"] in ids]
            self.assertEqual({row["userId"] for row in rows},
                             {members[name]["id"] for name in ("purchase", "commission", "both")})
            self.assertEqual(len(rows), 3)
            both = next(row for row in rows if row["userId"] == members["both"]["id"])
            self.assertTrue(both["purchasedVipToday"])
            self.assertTrue(both["referralCommissionToday"])
            self.assertTrue(all(row["status"] == "pending" for row in rows))
            for activity, expected in (("vip", ("purchase", "both")),
                                       ("commission", ("commission", "both"))):
                filtered = admin_api.transaction_rows(cur,
                    {"type":"withdrawal", "status":"pending", "activity":activity}, True)
                matches = [row for row in filtered["transactions"] if row["userId"] in ids]
                self.assertEqual({row["userId"] for row in matches},
                                 {members[name]["id"] for name in expected})
                self.assertEqual(len(matches), 2)
        route = "/api/admin/today-withdrawals"
        self.assertEqual(self.request("GET", route, cookie="")[0], 401)
        status, result, _ = self.request("GET", route + "?limit=1&type=deposit&status=rejected")
        self.assertEqual(status, 200, result)
        self.assertEqual(len(result["transactions"]), 1)
        self.assertIsNotNone(result["nextCursor"])
        self.assertEqual(result["transactions"][0]["type"], "withdrawal")
        self.assertEqual(result["transactions"][0]["status"], "pending")
        for activity, key in (("vip", "purchasedVipToday"), ("commission", "referralCommissionToday")):
            status, filtered, _ = self.request("GET", route + "?activity=" + activity)
            self.assertEqual(status, 200, filtered)
            self.assertTrue(filtered["transactions"])
            self.assertTrue(all(row[key] for row in filtered["transactions"]))
        self.assertEqual(self.request("GET", route + "?activity=invalid")[0], 400)

    def test_withdrawal_sections_separate_admin_credit_and_granted_vip(self):
        """Synthetic settled fixtures verify routing without enabling real withdrawals."""
        self.login()
        members = {name: self.member()[0] for name in
                   ("normal", "credit", "vip", "both", "revoked_vip", "purchased_vip")}
        marker = "withdraw-classification-" + self.fixture_key
        with auth_backend.connect() as conn, conn.cursor() as cur:
            cur.execute("INSERT INTO shineray_admin_resources(kind,value) VALUES ('product','{}') RETURNING id")
            product = cur.fetchone()["id"]
            self.resources.append(product)
            for name, member in members.items():
                uid = member["id"]
                if name in ("credit", "both"):
                    admin_api.money_operation(cur, None, uid, "credit",
                                              {"amount": 5000, "requestId": marker + name})
                if name in ("vip", "both", "revoked_vip"):
                    cur.execute("""INSERT INTO shineray_admin_vip_grants
                        (request_id,user_id,admin_id,product_id,product_snapshot,status,expires_at)
                        VALUES (%s,%s,NULL,%s,'{"name":"VIP test"}',%s,now()+interval '30 days')""",
                                (marker + name, uid, product,
                                 "revoked" if name == "revoked_vip" else "active"))
                if name == "purchased_vip":
                    cur.execute("""INSERT INTO shineray_transactions
                        (user_id,kind,label,amount_fcfa,provider_reference)
                        VALUES (%s,'purchase','Test achat',-100,%s)""", (uid, marker + "-purchase"))
                cur.execute("""INSERT INTO shineray_transactions
                    (user_id,kind,label,amount_fcfa,provider_reference)
                    VALUES (%s,'withdrawal','Test classement uniquement',-100,%s)""", (uid, marker + name))
        def history(assistance, extra=""):
            status, body, _ = self.request("GET", "/api/admin/transaction-history?"
                f"type=withdrawal&assistance={assistance}&search={marker}{extra}")
            self.assertEqual(status, 200, body)
            return body
        admin = history("admin")
        normal = history("normal")
        expected_admin = {members[name]["id"] for name in ("credit", "vip", "both", "revoked_vip")}
        expected_normal = {members[name]["id"] for name in ("normal", "purchased_vip")}
        self.assertEqual({row["userId"] for row in admin["transactions"]}, expected_admin)
        self.assertEqual({row["userId"] for row in normal["transactions"]}, expected_normal)
        self.assertTrue(all(row["adminAssisted"] for row in admin["transactions"]))
        self.assertTrue(all(not row["adminAssisted"] for row in normal["transactions"]))
        flags = {row["userId"]: (row["hasAdminCredit"], row["hasAdminVipGrant"])
                 for row in history("all")["transactions"]}
        self.assertEqual(flags[members["credit"]["id"]], (True, False))
        self.assertEqual(flags[members["vip"]["id"]], (False, True))
        self.assertEqual(flags[members["both"]["id"]], (True, True))
        page = history("admin", "&limit=1")
        self.assertEqual(page["total"], 4)
        self.assertEqual(len(page["transactions"]), 1)
        self.assertEqual(page["nextCursor"], "1")
        # A classification change must not manufacture pending requests.
        self.assertEqual(history("admin", "&status=pending")["total"], 0)
        self.assertEqual(history("normal", "&status=pending")["total"], 0)

    def test_pending_withdrawals_show_live_direct_invites_and_settled_commissions(self):
        self.login()
        owner = self.member_user

        def invite_code(user):
            with auth_backend.connect() as conn, conn.cursor() as cur:
                cur.execute("SELECT referral_code FROM shineray_users WHERE id=%s", (user["id"],))
                return cur.fetchone()["referral_code"]

        child, _ = self.member(referral_code=invite_code(owner))
        self.member(referral_code=invite_code(child))  # Not a direct invite of owner.
        unrelated, _ = self.member()
        with auth_backend.connect() as conn, conn.cursor() as cur:
            admin_api.money_operation(cur, None, owner["id"], "credit",
                {"amount": 5000, "requestId": self.fixture_key + "-credit"})
            for user in (owner, child, unrelated):
                # Pending-only fixtures; no payout, approval or external transfer.
                cur.execute("""INSERT INTO shineray_withdrawal_requests
                    (request_id,user_id,wallet_id,amount_fcfa,fee_fcfa,net_amount_fcfa,wallet_snapshot)
                    VALUES (%s,%s,0,2300,460,1840,%s)""",
                    (uuid.uuid4(), user["id"], Jsonb({"channel": "TOGOCEL",
                        "destination": user["phone"], "receiver_name": "Isolated fixture"})))

        def pending(user, assistance):
            status, data, _ = self.request("GET",
                "/api/admin/transaction-history?type=withdrawal&status=pending"
                f"&assistance={assistance}&search={user['phone']}")
            self.assertEqual(status, 200, data)
            self.assertEqual(data["total"], 1)
            return data["transactions"][0]

        # Registration alone counts, even before any first deposit or VIP purchase.
        self.assertEqual(pending(owner, "admin")["referralCount"], 1)
        self.assertEqual(pending(owner, "admin")["referralCommissionAmount"], 0)
        self.assertEqual(pending(child, "normal")["referralCount"], 1)
        self.assertEqual(pending(unrelated, "normal")["referralCount"], 0)
        status, team, _ = self.request("GET", "/api/team", cookie=self.member_cookie)
        self.assertEqual(status, 200)
        self.assertEqual(team["levels"][0], 1)

        # Only a settled commission counts, never the welcome/admin bonus.
        status, data, _ = self.request("POST", "/api/admin/deposits", {
            "phone": child["phone"], "amount_fcfa": 3500,
            "provider_reference": "referral-metrics-" + self.fixture_key,
            "receipt_verified": True,
        })
        self.assertEqual(status, 201, data)
        row = pending(owner, "admin")
        self.assertEqual(row["referralCount"], 1)
        self.assertEqual(row["referralCommissionAmount"], 1400)
        self.assertEqual(pending(child, "normal")["referralCommissionAmount"], 0)

    def test_assets_are_identical_and_private_sources_are_unreachable(self):
        with ZipFile(admin_assets.ARCHIVE) as archive:
            for route, member in {
                admin_assets.ADMIN_ROUTE: "administration/index.html",
                "/admin-ui/general.js": "administration/admin.js",
                "/admin-ui/styles.css": "administration/styles/admin.css",
                "/admin-ui/transaction-history.js": "administration/transaction-history.js",
            }.items():
                status, data, _ = self.request("GET", route, raw=True)
                self.assertEqual(status, 200)
                if route == admin_assets.ADMIN_ROUTE:
                    self.assertIn(admin_assets.COMPAT_LINK, data)
                    data = data.replace(admin_assets.COMPAT_LINK, b"", 1)
                    data = data.replace(b'<script src="/admin-ui/today-withdrawals.js?v=1"></script>', b"", 1)
                    data = data.replace(b'<link rel="stylesheet" href="/pages/form-controls.css?v=1">', b"", 1)
                    from platform_brand import BRAND_SCRIPT, FAVICON_LINKS
                    data = data.replace(BRAND_SCRIPT, b"", 1).replace(FAVICON_LINKS, b"", 1)
                self.assertEqual(hashlib.sha256(data).digest(),
                                 hashlib.sha256(archive.read(admin_assets.PREFIX + member)).digest())
        self.assertEqual(self.request("GET", admin_assets.ADMIN_ROUTE + "/", raw=True)[0], 200)
        for route in ("/administration", "/administration/", "/server.js", "/admin_api.py", "/schema.sql", "/administration/index.html",
                      "/administration/admin.js", "/payments/routes.js",
                      "/attached_assets/aeronova-administration-complete_1792229186027.zip",
                      "/sprite-assets/../server.js", "/admin-ui/../../server.py"):
            self.assertEqual(self.request("GET", route, raw=True)[0], 404, route)

    def test_separate_auth_csrf_expiry_and_logout(self):
        self.assertEqual(self.request("GET", "/api/admin/overview", cookie=self.member_cookie)[0], 401)
        self.assertEqual(self.request("GET", "/api/admin/overview")[0], 401)
        self.assertEqual(self.request("POST", "/api/admin/deposits",
            {"phone": self.member_user["phone"], "amount_fcfa": 500,
             "provider_reference": "unauthorized-test-receipt", "receipt_verified": True})[0], 401)
        self.assertEqual(self.request("GET", "/administration-depots", raw=True)[0], 302)
        self.assertEqual(self.request("POST", "/api/admin/login",
            {"path": "administration", "password": self.password})[0], 404)
        self.assertEqual(self.request("POST", "/api/admin/login",
            {"path": admin_assets.ADMIN_PATH, "password": self.password}, origin=False)[0], 403)
        self.assertEqual(self.request("POST", "/api/admin/login",
            {"path": admin_assets.ADMIN_PATH, "password": "incorrect-password"})[0], 401)
        self.assertEqual(self.request("POST", "/api/admin/login",
            {"path": admin_assets.ADMIN_PATH, "password": self.password})[0], 401)
        self.login()
        self.assertEqual(self.request("GET", "/administration-depots", raw=True)[0], 200)
        self.assertEqual(self.request("GET", "/api/admin/overview?summary=true")[0], 200)
        self.assertEqual(self.request("POST", "/api/admin/logout")[0], 200)
        self.assertEqual(self.request("GET", "/api/admin/overview")[0], 401)
        self.login()
        with auth_backend.connect() as conn, conn.cursor() as cur:
            cur.execute("UPDATE shineray_console_sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=%s",
                        (self.console_tokens[-1],))
        self.assertEqual(self.request("GET", "/api/admin/overview")[0], 401)

    def test_failed_logins_are_counted_and_locked(self):
        for attempt in range(5):
            status, _, _ = self.request("POST", "/api/admin/login",
                {"path": admin_assets.ADMIN_PATH, "password": "incorrect-password"})
            self.assertEqual(status, 429 if attempt == 4 else 401)
        self.assertEqual(self.request("POST", "/api/admin/login",
            {"path": admin_assets.ADMIN_PATH, "password": self.admin_password})[0], 429)

    def test_password_rotation_invalidates_existing_console_sessions(self):
        self.login()
        self.assertEqual(self.request("GET", "/api/admin/overview?summary=true")[0], 200)
        self.configured_password.return_value = b"rotated-isolated-console-password"
        self.assertEqual(self.request("GET", "/api/admin/overview?summary=true")[0], 401)
        self.assertEqual(self.request("POST", "/api/admin/login",
            {"path": admin_assets.ADMIN_PATH, "password": self.admin_password})[0], 401)
        self.admin_password = "rotated-isolated-console-password"
        self.login()
        self.assertEqual(self.request("GET", "/api/admin/overview?summary=true")[0], 200)

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
        self.assertEqual(self.request("POST", base + "/credit", body, cookie=self.member_cookie)[0], 401)
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

    @patch("sonarapay_client.configured", return_value=False)
    def test_customer_payment_channels_use_admin_configuration_and_account_country(self, _configured):
        self.login()
        benin = self.create("payment-channels", {"country": "Bénin", "countryCode": "+229",
            "operatorName": "MTN Benin test", "receiverNumber": "0190123456",
            "receiverName": "Test merchant", "isActive": True}, "channel")
        togo = self.create("payment-channels", {"country": "Togo", "countryCode": "+228",
            "operatorName": "Togo test", "receiverNumber": "90123456", "isActive": True}, "channel")
        token, user, _ = auth_backend.register("+229", "01" + "".join(
            str(secrets.randbelow(10)) for _ in range(8)), self.password)
        self.users.append(user["id"])
        cookie = "shineray_session=" + token
        self.assertEqual(self.request("GET", "/api/payment-channels/me", cookie="")[0], 401)
        status, data, _ = self.request("GET", "/api/payment-channels/me", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual((data["countryCode"], data["phoneLength"]), ("+229", 10))
        ids = [item["id"] for item in data["channels"]]
        self.assertIn(benin["id"], ids)
        self.assertNotIn(togo["id"], ids)
        selected = next(item for item in data["channels"] if item["id"] == benin["id"])
        self.assertEqual(selected["receiverName"], "Test merchant")
        self.assertEqual(selected["receiverNumber"], "0190123456")
        self.request("PATCH", f"/api/admin/payment-channels/{benin['id']}", {"isActive": False})
        data = self.request("GET", "/api/payment-channels/me", cookie=cookie)[1]
        self.assertNotIn(benin["id"], [item["id"] for item in data["channels"]])
        self.assertEqual(auth_backend.account_summary(user["id"])["balance_fcfa"], 2300)

    def test_original_history_escaped_query_filters_and_pagination(self):
        self.login()
        reference = "history-fixture-" + secrets.token_hex(8)
        for suffix in ("-first", "-second"):
            status, body, _ = self.request("POST", "/api/admin/deposits", {
                "phone": self.member_user["phone"], "amount_fcfa": 3500,
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

    def test_banning_customer_revokes_only_customer_sessions(self):
        self.login()
        base = f"/api/admin/users/{self.member_user['id']}"
        self.assertEqual(self.request("POST", base + "/ban", {})[0], 200)
        self.assertEqual(self.request("GET", "/api/me", cookie=self.member_cookie)[0], 401)
        with self.assertRaises(auth_backend.AuthError):
            auth_backend.login("+228", self.member_user["phone"], self.password)
        self.assertEqual(self.request("POST", base + "/unban", {})[0], 200)
        self.assertEqual(self.request("GET", "/api/me", cookie=self.member_cookie)[0], 401)
        self.assertEqual(self.request("POST", f"/api/admin/users/{self.actor['id']}/ban", {})[0], 200)
        self.assertEqual(self.request("GET", "/api/admin/overview")[0], 200)
        # Even after customer logout there is no coupling to the console.
        self.assertEqual(self.request("POST", "/api/auth/logout", cookie=self.actor_cookie)[0], 200)
        self.assertEqual(self.request("GET", "/api/admin/overview")[0], 200)

    def test_forged_session_and_customer_privileges_do_not_authorize(self):
        self.assertEqual(self.request("GET", "/api/admin/overview",
                                    cookie="shineray_admin=" + secrets.token_urlsafe(32))[0], 401)
        with auth_backend.connect() as conn, conn.cursor() as cur:
            cur.execute("UPDATE shineray_users SET is_admin=true WHERE id=%s", (self.actor["id"],))
        self.assertEqual(self.request("GET", "/api/admin/overview", cookie=self.actor_cookie)[0], 401)
        self.assertEqual(self.request("GET", "/api/me", cookie="")[0], 401)
        self.login()
        self.assertEqual(self.request("GET", "/api/me")[0], 401)
        self.assertEqual(self.request("GET", "/api/admin/overview")[0], 200)

    def test_no_customer_lookup_or_creation_is_needed_for_console(self):
        with auth_backend.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*) AS total FROM shineray_users")
            before = cur.fetchone()["total"]
        with patch("auth_backend.get_user_for_session", side_effect=AssertionError("Customer auth must not run")):
            self.login()
            self.assertEqual(self.request("GET", "/api/admin/overview")[0], 200)
            self.assertEqual(self.request("GET", "/administration-depots", raw=True)[0], 200)
        with auth_backend.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*) AS total FROM shineray_users")
            self.assertEqual(cur.fetchone()["total"], before)


if __name__ == "__main__":
    unittest.main()
