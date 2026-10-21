"""Deposit minimum boundaries without database writes or provider requests."""
import unittest
import uuid
from unittest.mock import patch

import admin_api
import auth_backend
import manual_deposits
import sonarapay_payments
from deposit_settlement import settle_approved_deposit
from financial_policy import MIN_DEPOSIT_FCFA


class DepositMinimumTests(unittest.TestCase):
    def test_policy_and_admin_agree(self):
        self.assertEqual(MIN_DEPOSIT_FCFA, 500)
        self.assertEqual(admin_api.CONFIG["depositMin"], 500)
        self.assertEqual(admin_api.CONFIG["dashboxDeposit"], 500)
        self.assertEqual(auth_backend.MIN_ACTIVITY_AMOUNTS["recharge"], 500)

    def test_manual_boundary(self):
        for amount in (0, 499, 500, 3500):
            with self.subTest(amount=amount), patch.object(
                    auth_backend, "connect", side_effect=RuntimeError("validated")) as connect:
                body = dict(request_id=str(uuid.uuid4()), channel_id=1,
                            amount_fcfa=amount, phone="90000000")
                if amount < 500:
                    with self.assertRaisesRegex(ValueError, "500"):
                        manual_deposits.submit({"id": 1, "phone": "+22890000000"}, body)
                    connect.assert_not_called()
                else:
                    with self.assertRaisesRegex(RuntimeError, "validated"):
                        manual_deposits.submit({"id": 1, "phone": "+22890000000"}, body)

    def test_automatic_boundary(self):
        for amount in (0, 499, 500, 3500):
            with self.subTest(amount=amount), patch.object(
                    sonarapay_payments.provider, "configured", return_value=True), patch.object(
                    auth_backend, "connect", side_effect=RuntimeError("validated")) as connect:
                body = dict(requestId=str(uuid.uuid4()), operatorId="orange_bf",
                            amount=amount, phone="70000000")
                if amount < 500:
                    with self.assertRaisesRegex(ValueError, "500"):
                        sonarapay_payments.prepare({"id": 1, "phone": "+22670000000"}, body)
                    connect.assert_not_called()
                else:
                    with self.assertRaisesRegex(RuntimeError, "validated"):
                        sonarapay_payments.prepare({"id": 1, "phone": "+22670000000"}, body)

    def test_settlement_boundary(self):
        for amount in (0, 499, 500, 3500):
            with self.subTest(amount=amount), patch.object(
                    auth_backend, "connect", side_effect=RuntimeError("validated")) as connect:
                if amount < 500:
                    with self.assertRaisesRegex(ValueError, "500"):
                        settle_approved_deposit(1, amount, "test", approval_method="automatic")
                    connect.assert_not_called()
                else:
                    with self.assertRaisesRegex(RuntimeError, "validated"):
                        settle_approved_deposit(1, amount, "test", approval_method="automatic")
