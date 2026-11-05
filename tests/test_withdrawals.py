"""Opt-in development DB tests. No payout service is called."""
import concurrent.futures
import http.client
import json
import os
import secrets
import threading
import unittest
import uuid
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer
from types import SimpleNamespace
from unittest.mock import patch, MagicMock

from psycopg.types.json import Jsonb

import admin_api
import auth_backend as db
import vip_purchases
import withdrawals
import withdrawal_controls
from server import Handler


class WithdrawalWindowTests(unittest.TestCase):
    def test_morocco_boundaries_and_ramadan_offset(self):
        for month, day in ((10, 20), (2, 25)):
            for hour, minute, second, expected in (
                (8, 59, 59, False), (9, 0, 0, True), (10, 0, 0, True),
                (17, 59, 59, True), (18, 0, 0, False),
            ):
                local = datetime(2026, month, day, hour, minute, second, tzinfo=withdrawals.MOROCCO)
                self.assertEqual(withdrawals.withdrawal_window_open(local.astimezone(timezone.utc)), expected)
        self.assertNotEqual(datetime(2026, 10, 20, tzinfo=withdrawals.MOROCCO).utcoffset(),
                            datetime(2026, 2, 25, tzinfo=withdrawals.MOROCCO).utcoffset())

    def test_hard_cutoff_in_morocco_including_ramadan(self):
        for month, day in ((10, 20), (2, 25)):
            for hour, minute, second, closed in (
                (17, 59, 59, False), (18, 0, 0, True), (23, 59, 59, True),
            ):
                local = datetime(2026, month, day, hour, minute, second,
                                 tzinfo=withdrawals.MOROCCO)
                self.assertEqual(withdrawals.withdrawal_cutoff_reached(
                    local.astimezone(timezone.utc)), closed)

    def test_manual_open_cannot_bypass_cutoff(self):
        for mode in ("scheduled", "open"):
            with patch("withdrawal_controls.current_mode", return_value=mode), \
                 patch("withdrawals.withdrawal_cutoff_reached", return_value=True), \
                 patch("withdrawals.withdrawal_window_open", return_value=True):
                with self.assertRaisesRegex(db.AuthError, "18 h"):
                    withdrawal_controls.enforce(MagicMock())
                flags = withdrawal_controls.flags(MagicMock())
                self.assertFalse(flags["withdrawOpenOverride"])
                self.assertTrue(flags["withdrawClosedOverride"])
        with patch("withdrawal_controls.current_mode", return_value="open"), \
             patch("withdrawals.withdrawal_cutoff_reached", return_value=False), \
             patch("withdrawals.withdrawal_window_open", return_value=False):
            withdrawal_controls.enforce(MagicMock())


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1", "Development DB opt-in")
class WithdrawalTests(unittest.TestCase):
    def setUp(self):
        self.token, self.user, _ = db.register("+228", f"{secrets.randbelow(10**8):08d}", "withdrawal-test-password")
        self.uid = self.user["id"]
        self.handler = SimpleNamespace(headers={})
        self.window = patch("withdrawals.withdrawal_window_open", return_value=True)
        self.window_mock = self.window.start()
        self.addCleanup(self.window.stop)
        self.cutoff = patch("withdrawals.withdrawal_cutoff_reached", return_value=False)
        self.cutoff.start()
        self.addCleanup(self.cutoff.stop)
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO shineray_transactions
                (user_id,kind,label,amount_fcfa,provider_reference)
                VALUES (%s,'bonus','Fixture',1800,%s)""", (self.uid, "fixture:"+str(uuid.uuid4())))
            cur.execute("""INSERT INTO shineray_wallets(user_id,provider,phone,holder_name)
                VALUES (%s,'TOGOCEL',%s,'Fixture') RETURNING id""", (self.uid, self.user["phone"]))
            self.wallet = cur.fetchone()["id"]
            cur.execute("INSERT INTO shineray_admin_resources(kind,value) VALUES ('product','{}') RETURNING id")
            self.product = cur.fetchone()["id"]
        self.body = {"request_id": str(uuid.uuid4()), "wallet_id": self.wallet, "amount_fcfa": 2300}

    def tearDown(self):
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""DELETE FROM shineray_admin_audit WHERE event_type LIKE 'withdrawal_%%'
                AND details->>'user_id'=%s""", (str(self.uid),))
            for table in ("shineray_withdrawal_requests", "shineray_admin_operations",
                          "shineray_admin_vip_grants", "shineray_transactions", "shineray_wallets"):
                cur.execute(f"DELETE FROM {table} WHERE user_id=%s", (self.uid,))
            cur.execute("DELETE FROM shineray_admin_resources WHERE id=%s", (self.product,))
            cur.execute("DELETE FROM shineray_users WHERE id=%s", (self.uid,))

    def grant(self, status="active", expiry="1 day"):
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO shineray_admin_vip_grants
                (request_id,user_id,product_id,product_snapshot,status,expires_at)
                VALUES (%s,%s,%s,'{}',%s,now()+%s::interval)""",
                (str(uuid.uuid4()), self.uid, self.product, status, expiry))

    def bought(self, days=180, age="0 days"):
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO shineray_transactions
                (user_id,kind,label,amount_fcfa,provider_reference,details,created_at)
                VALUES (%s,'purchase','VIP1',-1,%s,%s,now()-%s::interval)""",
                (self.uid, "fixture:"+str(uuid.uuid4()), Jsonb({"vip": 1, "validity_days": days}), age))

    def balance(self):
        return db.account_summary(self.uid)["balance_fcfa"]

    def test_active_vip_minimum_and_classification(self):
        for status, expiry in (("active", "-1 day"), ("revoked", "1 day")):
            self.grant(status, expiry)
        self.bought(days=1, age="2 days")
        with self.assertRaises(db.AuthError) as error:
            withdrawals.submit(self.uid, self.body)
        self.assertEqual(error.exception.status, 403)
        self.bought()
        with self.assertRaisesRegex(ValueError, "1 500"):
            withdrawals.submit(self.uid, {**self.body, "amount_fcfa": 1499})
        body = self.body
        row = withdrawals.submit(self.uid, body)
        self.assertEqual(row["net_amount_fcfa"], 1840)
        self.assertEqual(row["fee_fcfa"], 460)
        self.assertEqual(self.balance(), 998)
        with db.connect() as conn, conn.cursor() as cur:
            admin = admin_api.transaction_rows(cur, {"type": "withdrawal", "status": "pending",
                                                     "assistance": "admin", "search": row["reference"]})
            normal = admin_api.transaction_rows(cur, {"type": "withdrawal", "status": "pending",
                                                      "assistance": "normal", "search": row["reference"]})
        self.assertEqual(admin["total"], 1)  # Historical revoked grant still counts as assistance.
        self.assertEqual(normal["total"], 0)
        self.assertEqual(admin["transactions"][0]["destination"], self.user["phone"])
        self.assertEqual(db.get_activity(self.uid, "withdrawal")[0]["status"], "pending")

    def test_admin_receives_frozen_wallet_not_registration_phone(self):
        self.grant()
        destination = "+22854648354"
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""UPDATE shineray_wallets SET phone=%s,holder_name='Omar'
                WHERE id=%s""", (destination, self.wallet))
        row = withdrawals.submit(self.uid, self.body)
        # A later edit must not change the recipient of an already submitted withdrawal.
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""UPDATE shineray_wallets SET phone='+22899999999',
                holder_name='Changed' WHERE id=%s""", (self.wallet,))
        def assert_recipient(status):
            with db.connect() as conn, conn.cursor() as cur:
                response = admin_api.transaction_rows(cur, {
                    "type": "withdrawal", "status": status,
                    "assistance": "admin", "search": row["reference"]})
            self.assertEqual(response["total"], 1)
            item = response["transactions"][0]
            self.assertEqual(item["registrationNumber"], self.user["phone"])
            self.assertEqual(item["payerNumber"], destination)
            self.assertEqual(item["destination"], destination)
            self.assertEqual(item["walletHolderName"], "Omar")
            self.assertEqual(item["operatorName"], "TOGOCEL")
        assert_recipient("pending")
        with patch("admin_api.require_admin", return_value=None):
            withdrawals.review(self.handler, int(row["id"].split("-")[1]), "approved")
        assert_recipient("approved")

    def test_unlimited_requests_minimum_fee_and_reserved_balance(self):
        self.grant()
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO shineray_transactions
                (user_id,kind,label,amount_fcfa,provider_reference)
                VALUES (%s,'bonus','Fixture',10000,%s)""",
                (self.uid, "fixture:"+str(uuid.uuid4())))
        bodies = [{**self.body, "request_id": str(uuid.uuid4()), "amount_fcfa": 1500}
                  for _ in range(8)]
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            rows = list(pool.map(lambda body: withdrawals.submit(self.uid, body), bodies))
        self.assertEqual(len({row["id"] for row in rows}), 8)
        for body, row in zip(bodies, rows):
            self.assertEqual(row["fee_fcfa"], 300)
            self.assertEqual(row["net_amount_fcfa"], 1200)
            self.assertEqual(withdrawals.submit(self.uid, body)["id"], row["id"])
        self.assertEqual(self.balance(), 1300)
        self.assertEqual(db.account_summary(self.uid)["reserved_fcfa"], 12000)
        with self.assertRaisesRegex(db.AuthError, "insuffisant"):
            withdrawals.submit(self.uid, {**bodies[0], "request_id": str(uuid.uuid4())})

    def test_reservation_concurrent_retry_and_review_exactly_once(self):
        self.grant()
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            rows = list(pool.map(lambda _: withdrawals.submit(self.uid, self.body), range(3)))
        self.assertEqual(len({r["id"] for r in rows}), 1)
        self.assertEqual(self.balance(), 1000)
        self.assertEqual(withdrawals.submit(self.uid, self.body)["balance_fcfa"], 1000)
        self.assertEqual(db.account_summary(self.uid)["reserved_fcfa"], 2300)
        with self.assertRaises(db.AuthError):
            withdrawals.submit(self.uid, {**self.body, "request_id": str(uuid.uuid4()), "amount_fcfa": 2300})
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO shineray_transactions
                (user_id,kind,label,amount_fcfa,provider_reference) VALUES (%s,'bonus','Fixture',2000,%s)""",
                (self.uid, "fixture:"+str(uuid.uuid4())))
        # Settled balance 5300, but spendable balance only 3000: cannot spend the reserve.
        with self.assertRaises(db.AuthError):
            vip_purchases.purchase(self.uid, {"productCode": "VIP1", "requestId": str(uuid.uuid4()), "expectedPrice": 4000})
        request_id = int(rows[0]["id"].split("-")[1])
        with self.assertRaises(db.AuthError):
            withdrawals.review(self.handler, request_id, "completed")
        with patch("admin_api.require_admin", return_value=None):
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                list(pool.map(lambda _: withdrawals.review(self.handler, request_id, "completed"), range(2)))
            with self.assertRaises(db.AuthError):
                withdrawals.review(self.handler, request_id, "rejected")
        self.assertEqual(self.balance(), 3000)  # Reserve becomes debit, not a second debit.
        history = db.get_activity(self.uid, "withdrawal")
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["status"], "succeeded")
        self.assertEqual(history[0]["net_amount_fcfa"], 1840)

    def test_rejection_releases_and_atomic_rollback(self):
        self.grant()
        row = withdrawals.submit(self.uid, self.body)
        request_id = int(row["id"].split("-")[1])
        with patch("admin_api.require_admin", return_value=None):
            with patch("admin_api.audit", side_effect=RuntimeError("fixture rollback")):
                with self.assertRaises(RuntimeError):
                    withdrawals.review(self.handler, request_id, "approved")
            self.assertEqual(self.balance(), 1000)
            withdrawals.review(self.handler, request_id, "rejected")
            withdrawals.review(self.handler, request_id, "rejected")
        self.assertEqual(self.balance(), 3300)
        self.assertEqual(db.get_activity(self.uid, "withdrawal")[0]["status"], "failed")
        with self.assertRaises(db.AuthError):
            withdrawals.submit(self.uid, {**self.body, "amount_fcfa": 1100})
        with self.assertRaises(ValueError):
            withdrawals.submit(self.uid, {**self.body, "request_id": str(uuid.uuid4()),
                                          "wallet_id": self.wallet+100000})

    def test_http_customer_and_original_admin_status(self):
        self.bought()
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        def request(method, path, payload, cookie=""):
            client = http.client.HTTPConnection("127.0.0.1", httpd.server_port)
            client.request(method, path, json.dumps(payload), {"Content-Type": "application/json", "Cookie": cookie,
                "Origin": f"http://127.0.0.1:{httpd.server_port}"})
            response = client.getresponse()
            status, body = response.status, json.loads(response.read())
            client.close()
            return status, body
        try:
            self.assertEqual(request("POST", "/api/withdrawals", self.body)[0], 401)
            cookie = "shineray_session="+self.token
            self.assertEqual(request("PATCH", "/api/admin/withdraw-override", {"mode": "open"}, cookie)[0], 401)
            status, payload = request("POST", "/api/withdrawals", self.body, cookie)
            self.assertEqual(status, 201, payload)
            route = "/api/admin/withdrawals/"+payload["withdrawal"]["id"]
            self.assertEqual(request("PATCH", route, {"status": "completed"})[0], 401)
            with patch("admin_api.require_admin", return_value=None), \
                 patch("api_limits.consume", return_value=None), \
                 patch("admin_api.admin_token_hash", return_value="isolated-fixture-hash"):
                self.assertEqual(request("PATCH", route, {"status": "completed"})[0], 200)
                with patch("withdrawal_controls.update", return_value={"ok": True, "mode": "open"}) as update:
                    self.assertEqual(request("PATCH", "/api/admin/withdraw-override", {"mode": "open"})[0], 200)
                    self.assertEqual(update.call_args.args[1:], (None, {"mode": "open"}))
        finally:
            httpd.shutdown()
            httpd.server_close()

    def test_closed_hours_no_reservation_but_existing_retry_still_works(self):
        self.grant()
        self.window_mock.return_value = False
        with self.assertRaisesRegex(db.AuthError, "heure du Maroc"):
            withdrawals.submit(self.uid, self.body)
        self.assertEqual(self.balance(), 3300)
        self.assertEqual(db.get_activity(self.uid, "withdrawal"), [])
        self.window_mock.return_value = True
        row = withdrawals.submit(self.uid, self.body)
        self.window_mock.return_value = False
        self.assertEqual(withdrawals.submit(self.uid, self.body)["id"], row["id"])

    def test_manual_override_keeps_vip_balance_and_individual_restrictions(self):
        with patch("withdrawal_controls.current_mode", return_value="open"):
            self.window_mock.return_value = False
            with self.assertRaisesRegex(db.AuthError, "VIP actif"):
                withdrawals.submit(self.uid, self.body)
            self.grant()
            with db.connect() as conn, conn.cursor() as cur:
                cur.execute("UPDATE shineray_users SET withdrawals_disabled=TRUE WHERE id=%s", (self.uid,))
            with self.assertRaisesRegex(db.AuthError, "désactivés"):
                withdrawals.submit(self.uid, self.body)
            with db.connect() as conn, conn.cursor() as cur:
                cur.execute("UPDATE shineray_users SET withdrawals_disabled=FALSE WHERE id=%s", (self.uid,))
            row = withdrawals.submit(self.uid, self.body)
            self.assertEqual(row["status"], "pending")
            with self.assertRaisesRegex(db.AuthError, "insuffisant"):
                withdrawals.submit(self.uid, {**self.body, "request_id": str(uuid.uuid4())})
        with patch("withdrawal_controls.current_mode", return_value="closed"):
            self.window_mock.return_value = True
            self.assertEqual(withdrawals.submit(self.uid, self.body)["id"], row["id"])
            with self.assertRaisesRegex(db.AuthError, "fermées"):
                withdrawals.submit(self.uid, {**self.body, "request_id": str(uuid.uuid4())})

    def test_persistent_schedule_control_transaction(self):
        # Roll back every global setting change: never affect other dev users.
        with db.connect() as conn:
            try:
                with conn.cursor() as cur:
                    for mode in ("open", "closed", "scheduled"):
                        status, result = admin_api.dispatch(
                            cur, None, "/api/admin/withdraw-override", "PATCH", {"mode": mode}, {})
                        self.assertEqual(status, 200)
                        self.assertEqual(result["mode"], mode)
                        self.assertEqual(result["withdrawOpenOverride"], mode == "open")
                        self.assertEqual(result["withdrawClosedOverride"], mode == "closed")
                        self.assertEqual(withdrawal_controls.current_mode(cur), mode)
                        flags = admin_api.dispatch(cur, None, "/api/admin/withdraw-override", "GET", {}, {})[1]
                        self.assertEqual(flags["mode"], mode)
                        self.window_mock.return_value = False
                        if mode == "open":
                            withdrawal_controls.enforce(cur)
                        else:
                            with self.assertRaises(db.AuthError):
                                withdrawal_controls.enforce(cur)
                        self.window_mock.return_value = True
                        if mode == "scheduled":
                            withdrawal_controls.enforce(cur)
                    for body in ({"mode": "invalid"}, {"mode": []}, {"mode": "open", "force": True}):
                        with self.assertRaises(ValueError):
                            withdrawal_controls.update(cur, None, body)
            finally:
                conn.rollback()
