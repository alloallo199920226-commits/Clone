"""Rehearse data reset against temporary tables, never public/customer tables."""
import os
from pathlib import Path
import unittest

import auth_backend as db


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1",
                     "Development DB opt-in")
class CustomerResetTests(unittest.TestCase):
    def test_reset_preserves_admin_and_configuration_and_rolls_back(self):
        script = Path("tools/reset_customer_data.sql").read_text()
        # Shadow EVERY named application table before executing any reset SQL.
        tables = [
            "admin_sessions", "sessions", "admin_login_attempts", "demo_activity",
            "gift_redemptions", "product_income", "withdrawal_requests",
            "sonarapay_orders", "first_deposits", "deposit_approvals",
            "manual_deposits", "admin_operations", "admin_audit",
            "admin_vip_grants", "transactions", "wallets",
        ]
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("CREATE TEMP TABLE shineray_users "
                        "(id bigint PRIMARY KEY,is_admin boolean NOT NULL,"
                        "referred_by bigint REFERENCES shineray_users(id))")
            cur.execute("CREATE TEMP TABLE shineray_admin_resources "
                        "(id bigint PRIMARY KEY,kind text,value text)")
            for name in tables:
                cur.execute(f"CREATE TEMP TABLE shineray_{name} "
                            "(id bigint PRIMARY KEY,user_id bigint "
                            "REFERENCES shineray_users(id),status text)")
            cur.execute("CREATE TEMP TABLE shineray_console_sessions (token text)")
            cur.execute("CREATE TEMP TABLE shineray_income_policy (setting text)")
            cur.execute("INSERT INTO shineray_users VALUES (1,true,NULL),(2,false,1)")
            cur.execute("INSERT INTO shineray_admin_resources VALUES "
                        "(1,'product','keep'),(2,'channel','keep')")
            cur.execute("INSERT INTO shineray_console_sessions VALUES ('keep')")
            cur.execute("INSERT INTO shineray_income_policy VALUES ('keep')")
            for name in tables:
                cur.execute(f"INSERT INTO shineray_{name} VALUES (1,2,'pending')")
            # All fixtures must exist before BEGIN in the supplied rehearsal.
            conn.commit()
            cur.execute(script)
            counts = []
            while True:
                if cur.description and cur.description[0].name == "stage":
                    counts.append(cur.fetchone())
                if not cur.nextset():
                    break
            self.assertEqual(counts[0]["customers"], 1)
            self.assertEqual(counts[1]["customers"], 0)
            self.assertEqual(counts[1]["admins"], 1)
            self.assertEqual(counts[1]["products"], 1)
            self.assertEqual(counts[1]["activities"], 0)
            self.assertEqual(counts[1]["withdrawals"], 0)
            # ROLLBACK really restored customer data.
            cur.execute("SELECT count(*) n FROM shineray_users")
            self.assertEqual(cur.fetchone()["n"], 2)
            for table in ("shineray_console_sessions", "shineray_income_policy"):
                cur.execute(f"SELECT count(*) n FROM {table}")
                self.assertEqual(cur.fetchone()["n"], 1)
