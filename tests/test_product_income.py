"""Temporary development accounts only; no provider calls or real clock changes."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import os
import secrets
import unittest
import uuid
from unittest.mock import patch

import psycopg
from psycopg.types.json import Jsonb

import auth_backend as db
import product_income as income
import vip_purchases as vip


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1", "Development DB opt-in")
class ProductIncomeTests(unittest.TestCase):
    def setUp(self):
        _, user, _ = db.register("+228", "9" + "".join(str(secrets.randbelow(10)) for _ in range(7)),
                                 "temporary-income-test-password")
        self.uid = user["id"]
        self.resources = []
        self.products = {code: dict(product) for code, product in vip.DEFAULT_PRODUCTS.items()}
        self.catalog = patch("vip_purchases.catalog", return_value=self.products)
        self.catalog.start()
        with db.connect() as conn, conn.cursor() as cur:
            self.activation = income.activation(cur)
            cur.execute("""INSERT INTO shineray_transactions
                (user_id,kind,label,amount_fcfa,provider_reference)
                VALUES (%s,'bonus','Income test fixture',20000,%s)""",
                        (self.uid, "income-fixture:" + str(uuid.uuid4())))

    def tearDown(self):
        self.catalog.stop()
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM shineray_admin_vip_grants WHERE user_id=%s", (self.uid,))
            if self.resources:
                cur.execute("DELETE FROM shineray_admin_resources WHERE id=ANY(%s)", (self.resources,))
            cur.execute("DELETE FROM shineray_transactions WHERE user_id=%s", (self.uid,))
            cur.execute("DELETE FROM shineray_users WHERE id=%s", (self.uid,))

    def buy(self, days=180, daily=1000, total=None):
        self.products["VIP1"].update(durationDays=days, dailyIncome=daily,
                                     totalIncome=total if total is not None else daily * days)
        result = vip.purchase(self.uid, {"productCode": "VIP1", "expectedPrice": 4000,
                                         "requestId": str(uuid.uuid4())})
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM shineray_product_income WHERE purchase_id=%s",
                        (result["purchaseId"],))
            return result, cur.fetchone()

    def credits(self):
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""SELECT amount_fcfa,details FROM shineray_transactions
                WHERE user_id=%s AND kind='income' ORDER BY id""", (self.uid,))
            return cur.fetchall()

    def old_purchase(self, age, days, details=None):
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO shineray_transactions
                (user_id,kind,label,amount_fcfa,provider_reference,created_at,details)
                VALUES (%s,'purchase','VIP1',-4000,%s,%s,%s) RETURNING id""",
                        (self.uid, "old-income-fixture:" + str(uuid.uuid4()),
                         self.activation - age, Jsonb({"vip": 1, "quantity": 1,
                            "validity_days": days, "income_fcfa": 0, **(details or {})})))
            return cur.fetchone()["id"]

    def test_exact_24h_and_concurrent_workers_pay_once(self):
        result, schedule = self.buy()
        first = schedule["next_due_at"]
        self.assertEqual(first - schedule["starts_at"], income.DAY)
        before = db.account_summary(self.uid)["balance_fcfa"]
        self.assertEqual(income.settle_user(self.uid, first - timedelta(microseconds=1)), 0)
        with ThreadPoolExecutor(max_workers=6) as workers:
            paid = list(workers.map(lambda _: income.settle_user(self.uid, first), range(6)))
        self.assertEqual(sum(paid), 1)
        self.assertEqual(db.account_summary(self.uid)["balance_fcfa"], before + 1000)
        self.assertEqual(income.settle_user(self.uid, first + income.DAY), 1)
        owned = db.get_products(self.uid)
        self.assertEqual(owned["income_fcfa"], 2000)
        self.assertEqual(owned["products"][0]["income_fcfa"], 2000)
        self.assertEqual(len(db.get_activity(self.uid)), 5)  # welcome + fixture + purchase + two incomes

    def test_existing_purchase_no_pre_activation_catchup_or_extended_lifetime(self):
        purchase = self.old_purchase(2 * income.DAY, 5)
        self.assertEqual(income.settle_user(self.uid, self.activation + income.DAY - timedelta(seconds=1)), 0)
        self.assertEqual(income.settle_user(self.uid, self.activation + income.DAY), 1)
        self.assertEqual(income.settle_user(self.uid, self.activation + 20 * income.DAY), 2)
        self.assertEqual(len(self.credits()), 3)
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT * FROM shineray_product_income WHERE purchase_id=%s", (purchase,))
            schedule = cur.fetchone()
            self.assertEqual(schedule["starts_at"], self.activation)
            self.assertEqual(schedule["expires_at"], self.activation + 3 * income.DAY)
            self.assertIsNone(schedule["next_due_at"])
            self.assertEqual(income.activation(cur), self.activation)

    def test_expired_purchase_never_starts_a_new_lifetime(self):
        self.old_purchase(200 * income.DAY, 180)
        self.assertEqual(income.settle_user(self.uid, self.activation + 1000 * income.DAY), 0)
        self.assertEqual(self.credits(), [])

    def test_snapshot_total_cap_partial_last_day_and_server_downtime(self):
        result, schedule = self.buy(days=5, total=2500)
        self.products["VIP1"].update(dailyIncome=9000, totalIncome=45000, durationDays=500)
        now = schedule["starts_at"] + 20 * income.DAY
        self.assertEqual(income.settle_user(self.uid, now), 3)
        self.assertEqual([credit["amount_fcfa"] for credit in self.credits()], [1000, 1000, 500])
        self.assertEqual(income.settle_user(self.uid, now), 0)
        owned = db.get_products(self.uid)["products"][0]
        self.assertEqual(owned["daily_income_fcfa"], 1000)
        self.assertEqual(owned["total_income_fcfa"], 2500)
        self.assertEqual(owned["income_fcfa"], 2500)
        self.assertIsNone(owned["next_income_at"])

    def test_each_purchase_has_its_own_cycle(self):
        _, first = self.buy()
        _, second = self.buy()
        self.assertGreater(second["starts_at"], first["starts_at"])
        self.assertEqual(income.settle_user(self.uid, first["next_due_at"]), 1)
        self.assertEqual(income.settle_user(self.uid, second["next_due_at"]), 1)
        self.assertEqual(len(self.credits()), 2)

    def test_transaction_rolls_back_both_money_and_progress(self):
        result, schedule = self.buy()
        reference = f"product-income:{result['purchaseId']}:2"
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO shineray_transactions
                (user_id,kind,label,amount_fcfa,provider_reference)
                VALUES (%s,'bonus','Conflict fixture',1,%s)""", (self.uid, reference))
        now = schedule["starts_at"] + 2 * income.DAY
        before = db.account_summary(self.uid)["balance_fcfa"]
        with self.assertRaises(psycopg.errors.UniqueViolation):
            income.settle_user(self.uid, now)
        self.assertEqual(self.credits(), [])
        self.assertEqual(db.account_summary(self.uid)["balance_fcfa"], before)
        self.assertEqual(db.get_products(self.uid)["income_fcfa"], 0)
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM shineray_transactions WHERE provider_reference=%s", (reference,))
        self.assertEqual(income.settle_user(self.uid, now), 2)

    def test_blocked_user_is_not_credited_until_unblocked(self):
        _, schedule = self.buy()
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("UPDATE shineray_users SET is_blocked=true WHERE id=%s", (self.uid,))
        self.assertEqual(income.settle_user(self.uid, schedule["next_due_at"]), 0)
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("UPDATE shineray_users SET is_blocked=false WHERE id=%s", (self.uid,))
        self.assertEqual(income.settle_user(self.uid, schedule["next_due_at"]), 1)

    def test_no_payment_for_admin_grants_or_unconfigured_legacy_product(self):
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("INSERT INTO shineray_admin_resources(kind,value) VALUES ('product','{}') RETURNING id")
            product_id = cur.fetchone()["id"]
            self.resources.append(product_id)
            cur.execute("""INSERT INTO shineray_admin_vip_grants
                (request_id,user_id,admin_id,product_id,product_snapshot,expires_at)
                VALUES (%s,%s,%s,%s,%s,now()+interval '180 days')""",
                        (str(uuid.uuid4()), self.uid, self.uid, product_id, Jsonb(self.products["VIP1"])))
        self.assertEqual(income.settle_user(self.uid, self.activation + 2 * income.DAY), 0)
        self.old_purchase(income.DAY, 5, {"daily_income_fcfa": None})
        self.assertEqual(income.settle_user(self.uid, self.activation + 2 * income.DAY), 0)
        self.assertEqual(self.credits(), [])

    def test_bounded_catchup_retains_progress_for_next_pass(self):
        _, schedule = self.buy(days=120)
        now = schedule["starts_at"] + 120 * income.DAY
        self.assertEqual(income.settle_user(self.uid, now), 100)
        self.assertEqual(income.settle_user(self.uid, now), 20)
        self.assertEqual(income.settle_user(self.uid, now), 0)
        self.assertEqual(sum(row["amount_fcfa"] for row in self.credits()), 120000)

    def test_background_batch_finds_due_schedules_without_a_customer_action(self):
        result, schedule = self.buy()
        income.run_once()
        self.assertEqual(self.credits(), [])
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""UPDATE shineray_product_income
                SET starts_at=now()-interval '24 hours',next_due_at=now()-interval '1 second'
                WHERE purchase_id=%s""", (result["purchaseId"],))
        income.run_once()
        income.run_once()
        self.assertEqual(len(self.credits()), 1)
        self.assertEqual(self.credits()[0]["amount_fcfa"], 1000)


if __name__ == "__main__":
    unittest.main()
