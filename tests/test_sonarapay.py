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
    def test_reconciliation_endpoint_is_read_only_bounded_and_cached(self):
        row = {"reference": "PAY-" + str(uuid.uuid4()), "description": "example",
               "rawApiResponse": {"private": "discard"}, "customerEmail": "discard"}
        with patch.object(client, "_recent_cache", None), \
                patch.object(client, "request", return_value=[row]) as request:
            first = client.recent_payments()
            second = client.recent_payments()
            request.assert_called_once_with("GET", "/api/public/v1/payments", allow_list=True)
            self.assertEqual(first, second)
            self.assertNotIn("rawApiResponse", first[0])
            self.assertNotIn("customerEmail", first[0])
        for payload in [{}, [None], [{}] * 201]:
            with self.subTest(payload_type=type(payload).__name__), \
                    patch.object(client, "_recent_cache", None), \
                    patch.object(client, "request", return_value=payload):
                with self.assertRaises(client.ProviderError):
                    client.recent_payments()

    def test_transport_accepts_list_only_for_reconciliation(self):
        with patch.dict(os.environ, {"SONARAPAY_KEY": "isolated-test-key-not-live"}), \
                patch.object(client, "build_opener") as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = b"[]"
            self.assertEqual(client.request("GET", "/api/public/v1/payments", allow_list=True), [])
            with self.assertRaises(client.ProviderError):
                client.check("reference")

    def test_ci_cm_payload_currency_and_operator_catalog(self):
        for phone, operator, currency, country in [
                ("+2250700000000", "mtn_ci", "XOF", "CI"),
                ("+237690000000", "orange_cm", "XAF", "CM")]:
            order = {"id": uuid.uuid4(), "payer_phone": phone,
                     "operator_id": operator, "amount_fcfa": 500}
            with patch.object(client, "request") as request:
                client.create(order)
                payload = request.call_args.args[2]
                self.assertEqual(payload["currency"], currency)
                self.assertEqual(payload["countryCode"], country)
        self.assertEqual(set(client.deposit_operators("+225")), {"orange_ci", "mtn_ci", "moov_ci"})
        self.assertEqual(set(client.deposit_operators("+237")), {"mtn_cm", "orange_cm"})
        self.assertNotIn("wave_ci", client.DEPOSIT_OPERATORS)

    def test_receipts_hide_provider_brand_without_changing_reference(self):
        self.assertEqual(auth_backend.payment_display_text("SonaraPay · MTN"), "MTN")
        self.assertEqual(auth_backend.payment_display_text("sonarapay:PAY-123"), "PAY-123")
        self.assertEqual(auth_backend.payment_display_text("MOOV"), "MOOV")
        self.assertIsNone(auth_backend.payment_display_text(None))

    def test_celtiis_disabled_for_new_deposits_but_history_preserved(self):
        self.assertEqual(set(client.deposit_operators("+229")), {"mtn_bj", "moov_bj"})
        self.assertEqual(client.deposit_operators("+226"), {})
        self.assertEqual(set(client.deposit_operators("+228")), {"tmoney_tg", "moov_tg"})
        with patch.object(client, "configured", return_value=True), \
                patch.object(auth_backend, "connect") as connect:
            with self.assertRaisesRegex(ValueError, "Opérateur invalide pour le pays"):
                payments.prepare({"phone": "+2290100000000"}, {
                    "amount": 3500, "operatorId": "celtiis_bj",
                    "phone": "0100000000", "requestId": str(uuid.uuid4()),
                })
            connect.assert_not_called()
        self.assertEqual(client.OPERATORS["celtiis_bj"]["operatorName"], "Celtiis Cash")

    def test_benin_mtn_automatic_and_old_orders_preserved(self):
        self.assertIn("mtn_bj", client.deposit_operators("+229"))
        self.assertFalse(client.manual_channel_allowed("+229", "MTN Mobile Money"))
        self.assertFalse(client.manual_channel_allowed("+229", "Moov"))
        self.assertFalse(client.manual_channel_allowed("+229", "Celtiis"))
        self.assertTrue(client.manual_channel_allowed("+225", "Wave"))
        self.assertFalse(client.manual_channel_allowed("+225", "MTN"))
        self.assertFalse(client.manual_channel_allowed("+237", "MTN"))
        with patch.object(client, "request") as request:
            client.create(self.order)
            self.assertEqual(request.call_args.args[2]["operatorId"], "mtn_bj")

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
        # Fixed provider fixtures exercise legacy 500-FCFA orders independently
        # of today's admission policy, covered by test_deposit_minimum.
        admission = patch.object(payments, "MIN_DEPOSIT_FCFA", 500)
        admission.start()
        self.addCleanup(admission.stop)
        self.ids = []
        self.references = {}
        self.env = patch.dict(os.environ, {"SONARAPAY_KEY": "isolated-test-key-not-live"})
        self.env.start()
        self.create_patch = patch.object(client, "create", side_effect=self.fake_create)
        self.check_patch = patch.object(client, "check", side_effect=lambda ref: self.references[ref])
        self.create = self.create_patch.start()
        self.check = self.check_patch.start()
        recent = patch.object(client, "recent_payments", return_value=[])
        self.recent = recent.start()
        self.addCleanup(recent.stop)
        self.addCleanup(self.env.stop)
        self.addCleanup(self.create_patch.stop)
        self.addCleanup(self.check_patch.stop)
        self.user, self.token = self.member()

    def member(self, prefix="+229", referral=""):
        length = auth_backend.PHONE_LENGTHS[prefix]
        local = ("01" + f"{secrets.randbelow(100_000_000):08d}") if prefix == "+229" else str(secrets.randbelow(10 ** length)).zfill(length)
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
        return {"amount": 500, "phone": self.user["phone"], "operatorId": "moov_bj",
                "requestId": str(uuid.uuid4())}

    def test_benin_mtn_manual_submission_blocked_after_automatic_switch(self):
        import manual_deposits
        with auth_backend.connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO shineray_admin_resources(kind,value)
                VALUES ('channel',%s::jsonb) RETURNING id""", (json.dumps({
                    "countryCode": "+229", "operatorName": "MTN",
                    "isActive": True, "receiverName": "Test fixture",
                    "receiverNumber": "0100000000",
                }),))
            channel_id = cur.fetchone()["id"]
        try:
            before = self.balance()
            with self.assertRaisesRegex(ValueError, "manuel n’est pas disponible"):
                manual_deposits.submit(self.user, {
                    "request_id": str(uuid.uuid4()), "channel_id": channel_id,
                    "amount_fcfa": 2500, "phone": self.user["phone"][4:],
                })
            self.assertEqual(self.balance(), before)
            self.create.assert_not_called()
        finally:
            with auth_backend.connect() as conn, conn.cursor() as cur:
                cur.execute("DELETE FROM shineray_manual_deposits WHERE channel_id=%s", (channel_id,))
                cur.execute("DELETE FROM shineray_admin_resources WHERE id=%s", (channel_id,))

    def test_benin_mtn_automatic_credit_exactly_once(self):
        before = self.balance()
        order = payments.prepare(self.user, {
            **self.body(), "amount": 2500, "operatorId": "mtn_bj",
        })
        result = payments.advance(order, initiate=True)
        self.create.assert_called_once()
        created = self.create.call_args.args[0]
        self.assertEqual(created["operator_id"], "mtn_bj")
        self.references["test-" + str(order["id"])]["transaction"]["status"] = "successful"
        result = payments.advance(self.allow_check(result))
        self.assertIsNotNone(result["credited_at"])
        payments.advance(self.allow_check(result))
        self.assertEqual(self.balance(), before + 2500)

    def fake_create(self, order, otp=None):
        ref = "test-" + str(order["id"])
        self.references[ref] = {"reference": ref, "transaction": {
            "status": "pending", "amount": order["amount_fcfa"], "currency": client.currency(order["payer_phone"]),
            "description": "IVECO:" + str(order["id"]),
            "countryCode": client.COUNTRY_CODES[client.country_prefix(order["payer_phone"])],
            "operatorId": order["operator_id"], "customerPhone": order["payer_phone"]}}
        # A creation response claiming success must never be enough.
        return {"reference": ref, "status": "successful"}

    def recovery_fixture(self):
        order = payments.prepare(self.user, self.body())
        ref = "PAY-" + str(uuid.uuid4())
        self.fake_create(order)
        proof = self.references.pop("test-" + str(order["id"]))
        proof["reference"] = ref
        proof["transaction"]["status"] = "successful"
        self.references[ref] = proof
        return order, ref, proof

    def test_lost_reference_recovery_credits_once_without_new_payment(self):
        import admin_api
        sponsor = self.user
        self.user, self.token = self.member(referral=sponsor["referral_code"])
        order, ref, proof = self.recovery_fixture()
        before = self.balance()
        with patch.object(admin_api, "require_admin"), patch.object(admin_api, "audit"):
            first = payments.recover_reference(object(), self.user["phone"], 500, ref)
            second = payments.recover_reference(object(), self.user["phone"], 500, ref)
        self.assertFalse(first["already_approved"])
        self.assertTrue(second["already_approved"])
        self.assertEqual(self.balance(), before + 500)
        self.assertEqual(self.balance(sponsor), 1700)
        saved = payments.load(self.user["id"], order["id"])
        self.assertEqual(saved["provider_reference"], ref)
        self.assertEqual(saved["status"], "successful")
        self.assertTrue(saved["credited_at"])
        self.create.assert_not_called()

    def test_recovery_rejects_unverified_or_mismatching_receipts(self):
        import admin_api
        order, ref, proof = self.recovery_fixture()
        before = self.balance()
        for field, bad in [
            ("status", "pending"), ("amount", 501), ("currency", "XAF"),
            ("operatorId", "mtn_bj"), ("countryCode", "TG"),
            ("customerPhone", "+2290100000000"), ("description", None),
        ]:
            old = proof["transaction"][field]
            proof["transaction"][field] = bad
            try:
                with self.subTest(field=field), patch.object(admin_api, "require_admin"), \
                        patch.object(admin_api, "audit"):
                    with self.assertRaises(ValueError):
                        payments.recover_reference(object(), self.user["phone"], 500, ref)
            finally:
                proof["transaction"][field] = old
        with patch.object(admin_api, "require_admin"), patch.object(admin_api, "audit"):
            for phone, amount in [(self.user["phone"], 501), ("+2290100000000", 500)]:
                with self.assertRaises(ValueError):
                    payments.recover_reference(object(), phone, amount, ref)
        self.assertEqual(self.balance(), before)
        self.assertIsNone(payments.load(self.user["id"], order["id"])["provider_reference"])
        self.create.assert_not_called()

    def test_recovery_requires_admin_before_provider_lookup(self):
        import admin_api
        order, ref, proof = self.recovery_fixture()
        with patch.object(admin_api, "require_admin",
                          side_effect=auth_backend.AuthError(403, "Réservé")):
            with self.assertRaises(auth_backend.AuthError):
                payments.recover_reference(object(), self.user["phone"], 500, ref)
        self.check.assert_not_called()
        self.create.assert_not_called()

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
        self.assertEqual(self.balance(), 1500)
        self.assertEqual(self.create.call_count, 1)
        self.assertEqual(self.check.call_count, 1)

    def test_minimum_2500_persists_and_settles_exactly_once(self):
        with patch.object(payments, "MIN_DEPOSIT_FCFA", 2500):
            order = payments.prepare(self.user, {**self.body(), "amount": 2500})
        result = payments.advance(order, initiate=True)
        reference = result["provider_reference"]
        self.references[reference]["transaction"]["status"] = "successful"
        result = payments.advance(self.allow_check(result))
        self.assertIsNotNone(result["credited_at"])
        self.assertEqual(self.balance(), 4000)
        payments.advance(self.allow_check(result))
        self.assertEqual(self.balance(), 4000)

    def test_old_persisted_order_can_settle_after_minimum_increase(self):
        with patch.object(payments, "MIN_DEPOSIT_FCFA", 300):
            order = payments.prepare(self.user, {**self.body(), "amount": 500})
        result = payments.advance(order, initiate=True)
        self.references[result["provider_reference"]]["transaction"]["status"] = "successful"
        result = payments.advance(self.allow_check(result))
        self.assertIsNotNone(result["credited_at"])
        self.assertEqual(self.balance(), 2000)

    def test_unknown_legacy_order_cannot_bypass_minimum(self):
        with self.assertRaisesRegex(ValueError, "introuvable"):
            payments.settle_approved_deposit(
                self.user["id"], 500, "sonarapay:invented-order",
                approval_method="automatic", existing_order_id=uuid.uuid4())
        self.assertEqual(self.balance(), 1500)

    def test_ci_cm_operators_and_currency_are_scoped_and_settle_once(self):
        for prefix, operators in [("+225", ("orange_ci", "mtn_ci", "moov_ci")),
                                  ("+237", ("mtn_cm", "orange_cm"))]:
            for operator in operators:
                with self.subTest(operator=operator):
                    self.user, self.token = self.member(prefix)
                    body = {**self.body(), "operatorId": operator}
                    with self.assertRaises(ValueError):
                        payments.prepare(self.user, {**body, "operatorId": "wave_ci"})
                    with self.assertRaises(ValueError):
                        payments.prepare(self.user, {**body, "operatorId": "mtn_bj"})
                    order = payments.advance(payments.prepare(self.user, body), initiate=True)
                    proof = self.references[order["provider_reference"]]
                    proof["transaction"]["status"] = "successful"
                    currency = "XAF" if prefix == "+237" else "XOF"
                    self.assertEqual(payments.public(order)["currency"], currency)
                    proof["transaction"]["currency"] = "XOF" if currency == "XAF" else "XAF"
                    self.assertFalse(payments.verified(order, proof))
                    proof["transaction"]["currency"] = currency
                    self.assertTrue(payments.verified(order, proof))
                    order = payments.advance(self.allow_check(order))
                    self.assertTrue(order["credited_at"])
                    self.assertEqual(self.balance(), 2000)
                    payments.advance(order)
                    self.assertEqual(self.balance(), 2000)

    def test_togo_operators_are_country_scoped_and_settle_once(self):
        for operator in ("tmoney_tg", "moov_tg"):
            with self.subTest(operator=operator):
                self.user, self.token = self.member("+228")
                body = {**self.body(), "operatorId": operator}
                with self.assertRaises(ValueError):
                    payments.prepare(self.user, {**body, "operatorId": "mtn_bj"})
                with self.assertRaises(ValueError):
                    payments.prepare(self.user, {**body, "phone": "+2290100000000"})
                order = payments.advance(payments.prepare(self.user, body), initiate=True)
                self.assertEqual(payments.public(order)["countryCode"], "+228")
                self.assertEqual(self.balance(), 1500)
                proof = self.references[order["provider_reference"]]
                proof["transaction"]["status"] = "successful"
                proof["transaction"]["countryCode"] = "BJ"
                self.assertFalse(payments.verified(order, proof))
                proof["transaction"]["countryCode"] = "TG"
                self.assertTrue(payments.verified(order, proof))
                order = payments.advance(self.allow_check(order))
                self.assertTrue(order["credited_at"])
                self.assertEqual(self.balance(), 2000)
                payments.advance(order)
                self.assertEqual(self.balance(), 2000)

    def test_burkina_new_deposits_manual_and_pending_until_admin_review(self):
        import manual_deposits
        self.user, self.token = self.member("+226")
        before = self.balance()
        for operator, name in (("orange_bf", "Orange Money"),
                               ("moov_bf", "Moov Money"), ("telecel_bf", "Telecel Cash")):
            with self.subTest(operator=operator):
                with self.assertRaises(auth_backend.AuthError) as denied:
                    payments.prepare(self.user, {**self.body(), "operatorId": operator})
                self.assertEqual(denied.exception.status, 403)
                with auth_backend.connect() as conn, conn.cursor() as cur:
                    cur.execute("""INSERT INTO shineray_admin_resources(kind,value)
                        VALUES ('channel',%s::jsonb) RETURNING id""", (json.dumps({
                            "countryCode": "+226", "operatorName": name,
                            "isActive": True, "receiverName": "Test fixture",
                            "receiverNumber": "70000000", "ussdTemplate": "*123#",
                        }),))
                    channel_id = cur.fetchone()["id"]
                try:
                    body = {"request_id": str(uuid.uuid4()), "channel_id": channel_id,
                            "amount_fcfa": 2500, "phone": self.user["phone"][4:]}
                    result = manual_deposits.submit(self.user, body)
                    self.assertEqual(result["status"], "pending")
                    self.assertEqual(manual_deposits.submit(self.user, body)["id"], result["id"])
                    self.assertEqual(self.balance(), before)
                    self.create.assert_not_called()
                    self.check.assert_not_called()
                finally:
                    with auth_backend.connect() as conn, conn.cursor() as cur:
                        cur.execute("DELETE FROM shineray_manual_deposits WHERE channel_id=%s", (channel_id,))
                        cur.execute("DELETE FROM shineray_admin_resources WHERE id=%s", (channel_id,))

    @patch.dict(client.DEPOSIT_OPERATORS, {
        key: client.OPERATORS[key] for key in ("orange_bf", "moov_bf", "telecel_bf")
    })
    def test_legacy_burkina_automatic_operators_are_country_scoped_and_settle_once(self):
        for operator in ("orange_bf", "moov_bf", "telecel_bf"):
            with self.subTest(operator=operator):
                self.user, self.token = self.member("+226")
                body = {**self.body(), "operatorId": operator}
                with self.assertRaises(ValueError):
                    payments.prepare(self.user, {**body, "operatorId": "tmoney_tg"})
                with self.assertRaises(ValueError):
                    payments.prepare(self.user, {**body, "phone": "+2290100000000"})
                order = payments.advance(payments.prepare(self.user, body), initiate=True)
                self.assertEqual(payments.public(order)["countryCode"], "+226")
                self.assertEqual(self.balance(), 1500)
                proof = self.references[order["provider_reference"]]
                proof["transaction"]["status"] = "successful"
                proof["transaction"]["countryCode"] = "BJ"
                self.assertFalse(payments.verified(order, proof))
                proof["transaction"]["countryCode"] = "BF"
                self.assertTrue(payments.verified(order, proof))
                result = payments.advance(self.allow_check(order))
                self.assertTrue(result["credited_at"])
                self.assertEqual(self.balance(), 2000)
                payments.advance(result)
                self.assertEqual(self.balance(), 2000)

    @patch.dict(client.DEPOSIT_OPERATORS, {"orange_bf": client.OPERATORS["orange_bf"]})
    def test_disabling_country_keeps_existing_order_tracking(self):
        self.user, self.token = self.member("+226")
        body = {**self.body(), "operatorId": "orange_bf"}
        order = payments.prepare(self.user, body)
        # Simulate an order prepared before the switch to manual.
        enabled = {key: value for key, value in client.DEPOSIT_OPERATORS.items()
                   if not key.endswith("_bf")}
        with patch.dict(client.DEPOSIT_OPERATORS, enabled, clear=True):
            with self.assertRaises(auth_backend.AuthError) as denied:
                payments.prepare(self.user, body)
            self.assertEqual(denied.exception.status, 403)
            with self.assertRaises(auth_backend.AuthError):
                payments.advance(order, initiate=True, otp="123456")
            self.create.assert_not_called()
            ref = self.fake_create(order)["reference"]
            payments._update(order["id"], reference=ref)
            self.references[ref]["transaction"]["status"] = "successful"
            result = payments.advance(self.allow_check(order))
            self.assertTrue(result["credited_at"])
            self.assertEqual(payments.public(result)["countryCode"], "+226")
            self.assertEqual(self.balance(), 2000)
            payments.advance(result)
            self.assertEqual(self.balance(), 2000)

    def test_exactly_once_credit_and_commissions_under_concurrency(self):
        sponsor = self.user
        self.user, self.token = self.member(referral=sponsor["referral_code"])
        body = self.body()
        order = payments.advance(payments.prepare(self.user, body), initiate=True)
        self.references[order["provider_reference"]]["transaction"]["status"] = "successful"
        order = self.allow_check(order)
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as workers:
            list(workers.map(lambda _: payments.advance(order), range(6)))
        self.assertEqual(self.balance(), 2000)
        self.assertEqual(self.balance(sponsor), 1700)
        self.assertEqual(self.create.call_count, 1)
        result = payments.advance(payments.load(self.user["id"], order["id"]))
        self.assertTrue(result["credited_at"])
        self.assertEqual(result["status"], "successful")
        self.assertEqual(self.balance(), 2000)

    def test_retries_and_new_drafts_cannot_duplicate_an_open_payment(self):
        body = self.body()
        order = payments.prepare(self.user, body)
        self.assertEqual(order["id"], payments.prepare(self.user, body)["id"])
        self.assertEqual(order["id"], payments.prepare(self.user, self.body())["id"])
        body["amount"] = 600
        with self.assertRaises(auth_backend.AuthError):
            payments.prepare(self.user, body)

    def test_timeout_retains_order_and_never_reposts_unknown_payment(self):
        order = payments.prepare(self.user, self.body())
        self.create.side_effect = client.ProviderError("unavailable")
        result = payments.advance(order, initiate=True)
        self.assertIsNone(result["provider_reference"])
        self.assertEqual(self.balance(), 1500)
        self.assertNotEqual(result["status"], "failed")
        self.create.side_effect = self.fake_create
        retried = payments.advance(self.allow_check(result), initiate=True)
        self.assertEqual(order["id"], retried["id"])
        self.assertEqual(self.create.call_args.args[0]["id"], order["id"])
        self.assertEqual(self.create.call_count, 1)
        self.assertTrue(payments.public(retried)["recoveringReference"])
        self.assertEqual(self.balance(), 1500)

    def lost_response(self, order, otp=None):
        ref = "PAY-" + str(uuid.uuid4())
        self.fake_create(order)
        proof = self.references.pop("test-" + str(order["id"]))
        proof["reference"] = ref
        proof["transaction"]["status"] = "successful"
        self.references[ref] = proof
        self.recent.return_value = [{**proof["transaction"], "reference": ref,
                                     "idempotencyKey": "iveco-" + str(order["id"])}]
        raise client.ProviderError("unavailable")

    def test_worker_recovers_lost_reference_and_credits_commissions_once(self):
        sponsor = self.user
        self.user, self.token = self.member(referral=sponsor["referral_code"])
        self.create.side_effect = self.lost_response
        order = payments.advance(payments.prepare(self.user, self.body()), initiate=True)
        self.assertIsNone(order["provider_reference"])
        self.assertEqual(self.balance(), 1500)
        self.allow_check(order)
        payments.reconcile_once()
        result = payments.load(self.user["id"], order["id"])
        self.assertEqual(result["status"], "successful")
        self.assertTrue(result["credited_at"])
        self.assertEqual(self.balance(), 2000)
        self.assertEqual(self.balance(sponsor), 1700)
        payments.reconcile_once()
        payments.advance(result)
        self.assertEqual(self.balance(), 2000)
        self.assertEqual(self.balance(sponsor), 1700)
        self.assertEqual(self.create.call_count, 1)
        self.check.assert_called()

    def test_automatic_recovery_requires_exact_identity_and_verified_status(self):
        self.create.side_effect = self.lost_response
        order = payments.advance(payments.prepare(self.user, self.body()), initiate=True)
        receipt = self.recent.return_value[0]
        for field, value in [
            ("amount", 501), ("currency", "XAF"), ("countryCode", "TG"),
            ("customerPhone", "+2290100000000"), ("operatorId", "mtn_bj"),
            ("description", "IVECO:" + str(uuid.uuid4())),
            ("idempotencyKey", "iveco-" + str(uuid.uuid4())),
            ("reference", "not-a-provider-reference"),
        ]:
            old = receipt[field]
            receipt[field] = value
            try:
                with self.subTest(field=field):
                    result = payments.advance(self.allow_check(order))
                    self.assertIsNone(result["provider_reference"])
                    self.assertIsNone(result["credited_at"])
                    self.assertEqual(self.balance(), 1500)
            finally:
                receipt[field] = old
        proof = self.references[receipt["reference"]]["transaction"]
        proof["status"] = "pending"
        result = payments.advance(self.allow_check(order))
        self.assertEqual(result["provider_reference"], receipt["reference"])
        self.assertFalse(result["credited_at"])
        proof["status"] = "successful"
        result = payments.advance(self.allow_check(result))
        self.assertTrue(result["credited_at"])
        self.assertEqual(self.create.call_count, 1)

    def test_recovery_unavailable_or_ambiguous_never_credits_or_reposts(self):
        self.create.side_effect = self.lost_response
        order = payments.advance(payments.prepare(self.user, self.body()), initiate=True)
        receipt = self.recent.return_value[0]
        self.recent.return_value = [receipt, {**receipt, "reference": "PAY-" + str(uuid.uuid4())}]
        result = payments.advance(self.allow_check(order))
        self.assertEqual(result["last_error"], "reference_mismatch")
        self.assertIsNone(result["provider_reference"])
        self.recent.side_effect = client.ProviderError("unavailable")
        result = payments.advance(self.allow_check(order), initiate=True)
        self.assertEqual(result["last_error"], "unavailable")
        self.assertIsNone(result["credited_at"])
        self.assertEqual(self.balance(), 1500)
        self.assertEqual(self.create.call_count, 1)
        self.recent.side_effect = client.ProviderError("credentials")
        result = payments.advance(self.allow_check(result))
        self.assertNotEqual(result["status"], "failed", "A failed read is not a rejected debit")
        self.assertEqual(self.balance(), 1500)

    def test_automated_recovery_does_not_double_a_legacy_manual_credit(self):
        import admin_api
        from deposit_settlement import settle_approved_deposit
        self.create.side_effect = self.lost_response
        order = payments.advance(payments.prepare(self.user, {**self.body(), "amount": 2500}), initiate=True)
        ref = self.recent.return_value[0]["reference"]
        with patch.object(admin_api, "require_admin"), patch.object(admin_api, "audit"):
            settle_approved_deposit(self.user["id"], 2500, ref,
                                    approval_method="manual", console_handler=object())
        result = payments.advance(self.allow_check(order))
        self.assertIsNone(result["credited_at"])
        self.assertEqual(result["last_error"], "verification")
        self.assertEqual(self.balance(), 4000)

    def test_recovery_does_not_create_uninitiated_or_repeat_otp_payment(self):
        order = payments.prepare(self.user, self.body())
        payments.advance(order)
        self.recent.assert_not_called()
        self.create.assert_not_called()

    @patch.dict(client.DEPOSIT_OPERATORS, {"moov_bf": client.OPERATORS["moov_bf"]})
    def test_automatic_reference_recovery_across_automatic_countries(self):
        self.create.side_effect = self.lost_response
        for prefix, operator in [
            ("+229", "moov_bj"), ("+226", "moov_bf"), ("+228", "moov_tg"),
            ("+225", "mtn_ci"), ("+237", "orange_cm"),
        ]:
            with self.subTest(country=prefix):
                self.user, self.token = self.member(prefix)
                order = payments.advance(payments.prepare(self.user, {
                    **self.body(), "operatorId": operator}), initiate=True)
                result = payments.advance(self.allow_check(order))
                self.assertTrue(result["credited_at"])
                self.assertEqual(self.balance(), 2000)
                self.assertEqual(result["operator_id"], operator)
        self.assertEqual(self.create.call_count, 5)

    @patch.dict(client.DEPOSIT_OPERATORS, {"orange_bf": client.OPERATORS["orange_bf"]})
    def test_lost_otp_submission_can_be_recovered_without_repeating_otp(self):
        self.user, self.token = self.member("+226")
        order = payments.prepare(self.user, {**self.body(), "operatorId": "orange_bf"})
        self.create.side_effect = lambda order, otp=None: {"requiresOtp": True}
        order = payments.advance(order, initiate=True)
        self.assertEqual(order["status"], "otp_required")
        self.create.side_effect = self.lost_response
        order = payments.advance(self.allow_check(order), initiate=True, otp="123456")
        self.assertEqual(order["status"], "unknown")
        order = payments.advance(self.allow_check(order))
        self.assertTrue(order["credited_at"])
        self.assertEqual(self.create.call_count, 2)

    def test_amount_mismatch_is_review_not_credit(self):
        order = payments.advance(payments.prepare(self.user, self.body()), initiate=True)
        self.references[order["provider_reference"]]["transaction"].update(status="successful", amount=501)
        result = payments.advance(self.allow_check(order))
        self.assertEqual(result["status"], "review")
        self.assertEqual(self.balance(), 1500)

    def test_failed_does_not_credit(self):
        order = payments.advance(payments.prepare(self.user, self.body()), initiate=True)
        self.references[order["provider_reference"]]["transaction"]["status"] = "failed"
        self.assertEqual(payments.advance(self.allow_check(order))["status"], "failed")
        self.assertEqual(self.balance(), 1500)

    def test_rotated_key_cannot_reinitiate_ambiguous_payment(self):
        order = payments.prepare(self.user, self.body())
        with patch.object(client, "fingerprint", return_value="changed"):
            result = payments.advance(order, initiate=True)
        self.assertEqual(result["last_error"], "credentials_changed")
        self.create.assert_not_called()
        self.assertEqual(self.balance(), 1500)

    def test_other_countries_and_invalid_values_are_rejected(self):
        other, _ = self.member("+227")
        with self.assertRaises(auth_backend.AuthError):
            payments.prepare(other, self.body())
        for changes in [{"amount": True}, {"amount": 299}, {"amount": 500000001},
                        {"operatorId": "mtn_cm"}, {"phone": "12345678"}, {"requestId": "bad"},
                        {"status": "successful"}, {"phone": "+2299912345678"}]:
            with self.subTest(changes=changes), self.assertRaises((ValueError, auth_backend.AuthError)):
                payments.prepare(self.user, {**self.body(), **changes})

    @patch.dict(client.DEPOSIT_OPERATORS, {"orange_bf": client.OPERATORS["orange_bf"]})
    def test_orange_initial_otp_api_is_validated_and_not_persisted(self):
        self.user, self.token = self.member("+226")
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        def post(body):
            conn = http.client.HTTPConnection(*server.server_address)
            host = f"{server.server_address[0]}:{server.server_address[1]}"
            conn.request("POST", "/api/sonarapay/payments", json.dumps(body), {
                "Cookie": "shineray_session=" + self.token,
                "Content-Type": "application/json", "Origin": "http://" + host,
            })
            response = conn.getresponse()
            result = response.status, json.loads(response.read())
            conn.close()
            return result
        try:
            body = {**self.body(), "operatorId": "orange_bf", "otp": "123456"}
            status, result = post({**body, "otp": "abc"})
            self.assertEqual(status, 400)
            self.create.assert_not_called()
            status, result = post(body)
            self.assertEqual(status, 200)
            self.assertEqual(self.create.call_args.args[1], "123456")
            self.assertNotIn("123456", json.dumps(result))
            self.assertEqual(self.balance(), 1500)
            self.assertEqual(post(body)[0], 409)
            self.assertEqual(self.create.call_count, 1)
        finally:
            server.shutdown()
            server.server_close()

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
        other, other_token = self.member("+226")
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
            self.assertEqual(result["provider"], "mixed")
            self.assertEqual({row["id"] for row in result["channels"] if row["provider"] == "sonarapay"}, {"mtn_bj", "moov_bj"})
            status, result = get("/api/payment-channels/me", other_token)
            self.assertEqual(status, 200)
            self.assertEqual(result["provider"], "manual")
            self.assertEqual(result["countryCode"], "+226")
            self.assertEqual(result["phoneLength"], 8)
            self.assertTrue(all(row["provider"] == "manual" for row in result["channels"]))
            self.assertNotIn("key_fingerprint", json.dumps(get("/api/sonarapay/payments", self.token)[1]))
            self.assertEqual(other["phone"][:4], "+226")
            togo, togo_token = self.member("+228")
            status, result = get("/api/payment-channels/me", togo_token)
            self.assertEqual(status, 200)
            self.assertEqual(result["provider"], "sonarapay")
            self.assertEqual(result["countryCode"], "+228")
            self.assertEqual(result["phoneLength"], 8)
            self.assertEqual({row["id"] for row in result["channels"]},
                             {"tmoney_tg", "moov_tg"})
            ci, ci_token = self.member("+225")
            cm, cm_token = self.member("+237")
            status, result = get("/api/payment-channels/me", cm_token)
            self.assertEqual(status, 200)
            self.assertEqual(result["phoneLength"], 9)
            self.assertEqual({row["id"] for row in result["channels"]}, {"mtn_cm", "orange_cm"})
            resource_id = None
            try:
                with auth_backend.connect() as conn, conn.cursor() as cur:
                    cur.execute("""INSERT INTO shineray_admin_resources(kind,value)
                                   VALUES ('channel',%s::jsonb) RETURNING id""",
                                (json.dumps({"countryCode": "+225", "operatorName": "Wave test",
                                             "isActive": True, "receiverNumber": "0700000000",
                                             "receiverName": "Marchand test", "ussdTemplate": "*123#"}),))
                    resource_id = cur.fetchone()["id"]
                status, result = get("/api/payment-channels/me", ci_token)
                self.assertEqual(status, 200)
                self.assertEqual(result["provider"], "mixed")
                automatic = {row["id"] for row in result["channels"] if row["provider"] == "sonarapay"}
                self.assertEqual(automatic, {"orange_ci", "mtn_ci", "moov_ci"})
                wave = next(row for row in result["channels"] if row["id"] == resource_id)
                self.assertEqual(wave["provider"], "manual")
                self.assertEqual(wave["receiverNumber"], "0700000000")
            finally:
                if resource_id:
                    with auth_backend.connect() as conn, conn.cursor() as cur:
                        cur.execute("DELETE FROM shineray_admin_resources WHERE id=%s", (resource_id,))
        finally:
            server.shutdown()
            server.server_close()
