"""Opt-in development DB tests. Provider transport is ALWAYS mocked; no real debit."""
import concurrent.futures
import copy
import http.client
import io
import json
import os
import secrets
import threading
import unittest
import uuid
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from urllib.error import HTTPError

import auth_backend
import sonarapay_client as client
import sonarapay_payments as payments
from server import Handler


class VerificationTests(unittest.TestCase):
    def test_receipts_hide_provider_brand_without_changing_reference(self):
        self.assertEqual(auth_backend.payment_display_text("SonaraPay · MTN"), "MTN")
        self.assertEqual(auth_backend.payment_display_text("sonarapay:PAY-123"), "PAY-123")
        self.assertEqual(auth_backend.payment_display_text("MOOV"), "MOOV")
        self.assertIsNone(auth_backend.payment_display_text(None))

    def test_celtiis_disabled_for_new_deposits_but_history_preserved(self):
        self.assertEqual(set(client.deposit_operators("+229")), {"mtn_bj", "moov_bj"})
        self.assertEqual(set(client.deposit_operators("+226")), {"orange_bf", "moov_bf", "telecel_bf"})
        with patch.object(client, "configured", return_value=True), \
                patch.object(auth_backend, "connect") as connect:
            with self.assertRaisesRegex(ValueError, "Opérateur invalide pour le pays"):
                payments.prepare({"phone": "+2290100000000"}, {
                    "amount": 500, "operatorId": "celtiis_bj",
                    "phone": "0100000000", "requestId": str(uuid.uuid4()),
                })
            connect.assert_not_called()
        self.assertEqual(client.OPERATORS["celtiis_bj"]["operatorName"], "Celtiis Cash")

    def setUp(self):
        self.order = {"id": uuid.uuid4(), "amount_fcfa": 500, "provider_reference": "test-reference",
                      "operator_id": "mtn_bj", "payer_phone": "+2290100000000"}
        self.proof = {"reference": "test-reference", "transaction": {
            "status": "successful", "amount": "500", "currency": "XOF",
            "description": "IVECO:" + str(self.order["id"]), "countryCode": "BJ",
            "operatorId": "mtn_bj", "customerPhone": "+2290100000000"}}

    def test_verified_status_and_exact_receipt(self):
        self.assertTrue(payments.verified(self.order, self.proof))

    def test_incomplete_or_mismatching_receipts_never_credit(self):
        for field, value in [
            ("amount", 501), ("amount", True), ("amount", None), ("amount", "NaN"),
            ("amount", "500.01"), ("currency", "XAF"), ("status", "pending"),
            ("countryCode", "TG"), ("operatorId", "moov_bj"), ("description", "another-order"),
            ("customerPhone", "+2290199999999"),
        ]:
            with self.subTest(field=field, value=value):
                proof = copy.deepcopy(self.proof)
                proof["transaction"][field] = value
                self.assertFalse(payments.verified(self.order, proof))
        for field in ["amount", "currency", "status"]:
            proof = copy.deepcopy(self.proof)
            del proof["transaction"][field]
            self.assertFalse(payments.verified(self.order, proof))
        self.proof["reference"] = "another-payment"
        self.assertFalse(payments.verified(self.order, self.proof))

    def test_only_fixed_https_endpoint_and_stable_key(self):
        with patch.object(client, "request", return_value={}) as request:
            client.create(self.order, "123456")
            first = request.call_args
            client.create(self.order)
            self.assertEqual(first.args[3], request.call_args.args[3])
            self.assertEqual(first.args[2]["countryCode"], "BJ")
            self.assertEqual(first.args[2]["currency"], "XOF")
            self.assertEqual(first.args[2]["otp"], "123456")
            self.assertNotIn("otp", request.call_args.args[2])
            self.assertEqual(first.args[1], "/api/public/v1/payments")
            burkina = {**self.order, "operator_id": "orange_bf", "payer_phone": "+22670000000"}
            client.create(burkina, "123456")
            self.assertEqual(request.call_args.args[2]["countryCode"], "BF")
            self.assertEqual(request.call_args.args[2]["customerPhone"], "+22670000000")
            self.assertEqual(request.call_args.args[2]["otp"], "123456")
        self.assertIsNone(client.NoRedirects().redirect_request(None, None, 302, "", {}, "https://other.test"))

    def test_identifies_client_and_distinguishes_gateway_from_credentials(self):
        for status, body, expected in [
            (403, b"<html>Access denied</html>", "access_blocked"),
            (401, b'{"error":"Unauthorized"}', "credentials"),
            (403, b'{"error":"Forbidden"}', "credentials"),
        ]:
            with self.subTest(status=status, expected=expected):
                error = HTTPError("https://sonarapay.app/api/public/v1/payments/test",
                                  status, "Rejected", {}, io.BytesIO(body))
                with patch.dict(os.environ, {"SONARAPAY_KEY": "isolated-test-key-not-live"}), \
                        patch.object(client, "build_opener") as opener:
                    opener.return_value.open.side_effect = error
                    with self.assertRaises(client.ProviderError) as raised:
                        client.check("test")
                    self.assertEqual(raised.exception.code, expected)
                    request = opener.return_value.open.call_args.args[0]
                    self.assertEqual(request.get_header("User-agent"), "IVECO-Pay/1.0")


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1", "Development DB opt-in")
class PaymentTests(unittest.TestCase):
    def setUp(self):
        self.ids = []
        self.references = {}
        self.env = patch.dict(os.environ, {"SONARAPAY_KEY": "isolated-test-key-not-live"})
        self.env.start()
        self.create_patch = patch.object(client, "create", side_effect=self.fake_create)
        self.check_patch = patch.object(client, "check", side_effect=lambda ref: self.references[ref])
        self.create = self.create_patch.start()
        self.check = self.check_patch.start()
        self.addCleanup(self.env.stop)
        self.addCleanup(self.create_patch.stop)
        self.addCleanup(self.check_patch.stop)
        self.user, self.token = self.member()

    def member(self, prefix="+229", referral=""):
        local = ("01" + f"{secrets.randbelow(100_000_000):08d}") if prefix == "+229" else f"{secrets.randbelow(100_000_000):08d}"
        token, user, _days = auth_backend.register(prefix, local, "isolated-test-password", referral)
        self.ids.append(user["id"])
        return auth_backend.account_summary(user["id"]), token

    def tearDown(self):
        with auth_backend.connect() as conn, conn.cursor() as cur:
            for table in ["shineray_sonarapay_orders", "shineray_first_deposits", "shineray_transactions",
                          "shineray_deposit_approvals", "shineray_sessions"]:
                cur.execute(f"DELETE FROM {table} WHERE user_id=ANY(%s)", (self.ids,))
            cur.execute("DELETE FROM shineray_users WHERE id=ANY(%s)", (self.ids,))

    def body(self):
        return {"amount": 500, "phone": self.user["phone"], "operatorId": "mtn_bj",
                "requestId": str(uuid.uuid4())}

    def fake_create(self, order, otp=None):
        ref = "test-" + str(order["id"])
        self.references[ref] = {"reference": ref, "transaction": {
            "status": "pending", "amount": order["amount_fcfa"], "currency": "XOF",
            "description": "IVECO:" + str(order["id"]),
            "countryCode": client.COUNTRY_CODES[client.country_prefix(order["payer_phone"])],
            "operatorId": order["operator_id"], "customerPhone": order["payer_phone"]}}
        # A creation response claiming success must never be enough.
        return {"reference": ref, "status": "successful"}

    def allow_check(self, order):
        with auth_backend.connect() as conn, conn.cursor() as cur:
            cur.execute("""UPDATE shineray_sonarapay_orders SET checked_at=now()-interval '1 minute',
                           initiated_at=now()-interval '1 minute',lease_until=NULL WHERE id=%s""", (order["id"],))
        return payments.load(self.user["id"], order["id"])

    def balance(self, user=None):
        return auth_backend.account_summary((user or self.user)["id"])["balance_fcfa"]

    def test_pending_is_not_money_and_request_is_persisted_before_network(self):
        order = payments.prepare(self.user, self.body())
        self.assertEqual(payments.load(self.user["id"], order["id"])["amount_fcfa"], 500)
        result = payments.advance(order, initiate=True)
        self.assertEqual(result["status"], "pending")
        self.assertEqual(self.balance(), 2300)
        self.assertEqual(self.create.call_count, 1)
        self.assertEqual(self.check.call_count, 1)

    def test_burkina_operators_are_country_scoped_and_settle_once(self):
        for operator in ("orange_bf", "moov_bf", "telecel_bf"):
            with self.subTest(operator=operator):
                self.user, self.token = self.member("+226")
                body = {**self.body(), "operatorId": operator}
                with self.assertRaises(ValueError):
                    payments.prepare(self.user, {**body, "operatorId": "mtn_bj"})
                with self.assertRaises(ValueError):
                    payments.prepare(self.user, {**body, "phone": "+2290100000000"})
                order = payments.advance(payments.prepare(self.user, body), initiate=True)
                self.assertEqual(payments.public(order)["countryCode"], "+226")
                self.assertEqual(self.balance(), 2300)
                proof = self.references[order["provider_reference"]]
                proof["transaction"]["status"] = "successful"
                proof["transaction"]["countryCode"] = "BJ"
                self.assertFalse(payments.verified(order, proof))
                proof["transaction"]["countryCode"] = "BF"
                self.assertTrue(payments.verified(order, proof))
                order = payments.advance(self.allow_check(order))
                self.assertTrue(order["credited_at"])
                self.assertEqual(self.balance(), 2800)
                payments.advance(order)
                self.assertEqual(self.balance(), 2800)

    def test_exactly_once_credit_and_commissions_under_concurrency(self):
        sponsor = self.user
        self.user, self.token = self.member(referral=sponsor["referral_code"])
        body = self.body()
        order = payments.advance(payments.prepare(self.user, body), initiate=True)
        self.references[order["provider_reference"]]["transaction"]["status"] = "successful"
        order = self.allow_check(order)
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as workers:
            list(workers.map(lambda _: payments.advance(order), range(6)))
        self.assertEqual(self.balance(), 2800)
        self.assertEqual(self.balance(sponsor), 2500)
        self.assertEqual(self.create.call_count, 1)
        result = payments.advance(payments.load(self.user["id"], order["id"]))
        self.assertTrue(result["credited_at"])
        self.assertEqual(result["status"], "successful")
        self.assertEqual(self.balance(), 2800)

    def test_retries_and_new_drafts_cannot_duplicate_an_open_payment(self):
        body = self.body()
        order = payments.prepare(self.user, body)
        self.assertEqual(order["id"], payments.prepare(self.user, body)["id"])
        self.assertEqual(order["id"], payments.prepare(self.user, self.body())["id"])
        body["amount"] = 600
        with self.assertRaises(auth_backend.AuthError):
            payments.prepare(self.user, body)

    def test_timeout_retains_order_and_retries_original_idempotency_key(self):
        order = payments.prepare(self.user, self.body())
        self.create.side_effect = client.ProviderError("unavailable")
        result = payments.advance(order, initiate=True)
        self.assertIsNone(result["provider_reference"])
        self.assertEqual(self.balance(), 2300)
        self.assertNotEqual(result["status"], "failed")
        self.create.side_effect = self.fake_create
        retried = payments.advance(self.allow_check(result), initiate=True)
        self.assertEqual(order["id"], retried["id"])
        self.assertEqual(self.create.call_args.args[0]["id"], order["id"])
        self.assertEqual(self.balance(), 2300)

    def test_amount_mismatch_is_review_not_credit(self):
        order = payments.advance(payments.prepare(self.user, self.body()), initiate=True)
        self.references[order["provider_reference"]]["transaction"].update(status="successful", amount=501)
        result = payments.advance(self.allow_check(order))
        self.assertEqual(result["status"], "review")
        self.assertEqual(self.balance(), 2300)

    def test_failed_does_not_credit(self):
        order = payments.advance(payments.prepare(self.user, self.body()), initiate=True)
        self.references[order["provider_reference"]]["transaction"]["status"] = "failed"
        self.assertEqual(payments.advance(self.allow_check(order))["status"], "failed")
        self.assertEqual(self.balance(), 2300)

    def test_rotated_key_cannot_reinitiate_ambiguous_payment(self):
        order = payments.prepare(self.user, self.body())
        with patch.object(client, "fingerprint", return_value="changed"):
            result = payments.advance(order, initiate=True)
        self.assertEqual(result["last_error"], "credentials_changed")
        self.create.assert_not_called()
        self.assertEqual(self.balance(), 2300)

    def test_other_countries_and_invalid_values_are_rejected(self):
        other, _ = self.member("+228")
        with self.assertRaises(auth_backend.AuthError):
            payments.prepare(other, self.body())
        for changes in [{"amount": True}, {"amount": 499}, {"amount": 500000001},
                        {"operatorId": "mtn_cm"}, {"phone": "12345678"}, {"requestId": "bad"},
                        {"status": "successful"}, {"phone": "+2299912345678"}]:
            with self.subTest(changes=changes), self.assertRaises((ValueError, auth_backend.AuthError)):
                payments.prepare(self.user, {**self.body(), **changes})

    def test_otp_is_not_persisted_or_exposed(self):
        order = payments.prepare(self.user, self.body())
        self.create.side_effect = lambda order, otp=None: {"requiresOtp": True, "ussdCode": "*123#"}
        result = payments.advance(order, initiate=True)
        self.assertEqual(result["status"], "otp_required")
        self.assertEqual(result["ussd_code"], "*123#")
        result = payments.advance(self.allow_check(result), initiate=True, otp="123456")
        self.assertEqual(self.create.call_args.args[1], "123456")
        self.assertNotIn("123456", json.dumps(payments.public(result)))

    def test_api_ownership_authentication_and_country_routing(self):
        other, other_token = self.member("+228")
        order = payments.prepare(self.user, self.body())
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        def get(path, token=""):
            conn = http.client.HTTPConnection(*server.server_address)
            conn.request("GET", path, headers={"Cookie": "shineray_session=" + token})
            response = conn.getresponse()
            result = (response.status, json.loads(response.read()))
            conn.close()
            return result
        try:
            self.assertEqual(get("/api/sonarapay/payments")[0], 401)
            self.assertEqual(get("/api/sonarapay/payments/" + str(order["id"]), other_token)[0], 404)
            status, result = get("/api/payment-channels/me", self.token)
            self.assertEqual(status, 200)
            self.assertEqual(result["provider"], "sonarapay")
            self.assertEqual({row["id"] for row in result["channels"]}, {"mtn_bj", "moov_bj"})
            self.assertNotIn("provider", get("/api/payment-channels/me", other_token)[1])
            self.assertNotIn("key_fingerprint", json.dumps(get("/api/sonarapay/payments", self.token)[1]))
            self.assertEqual(other["phone"][:4], "+228")
            burkina, burkina_token = self.member("+226")
            status, result = get("/api/payment-channels/me", burkina_token)
            self.assertEqual(status, 200)
            self.assertEqual(result["provider"], "sonarapay")
            self.assertEqual(result["countryCode"], "+226")
            self.assertEqual(result["phoneLength"], 8)
            self.assertEqual({row["id"] for row in result["channels"]},
                             {"orange_bf", "moov_bf", "telecel_bf"})
        finally:
            server.shutdown()
            server.server_close()
