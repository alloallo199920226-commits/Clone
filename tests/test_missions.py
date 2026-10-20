"""Development-only reward tests; no provider calls or external payments."""
import concurrent.futures
import os
import secrets
import unittest
import uuid

from psycopg.types.json import Jsonb
import auth_backend as db
import missions


@unittest.skipUnless(os.getenv("RUN_ACCOUNT_INTEGRATION_TESTS") == "1", "Development DB opt-in")
class MissionTests(unittest.TestCase):
    def setUp(self):
        self.ids = []
        self.owner = self.member()

    def member(self, referral=""):
        _, user, _ = db.register("+228", f"9{secrets.randbelow(10**7):07d}",
                                 "temporary-mission-password", referral)
        self.ids.append(user["id"])
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("SELECT referral_code FROM shineray_users WHERE id=%s", (user["id"],))
            user["referral_code"] = cur.fetchone()["referral_code"]
        return user

    def tearDown(self):
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM shineray_transactions WHERE user_id=ANY(%s)", (self.ids,))
            cur.execute("DELETE FROM shineray_users WHERE id=ANY(%s)", (self.ids,))

    def purchase(self, user, vip=4):
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO shineray_transactions
                (user_id,kind,label,amount_fcfa,provider_reference,details)
                VALUES (%s,'purchase','Test purchase',-1,%s,%s)""",
                        (user["id"], "mission-test:"+str(uuid.uuid4()),
                         Jsonb({"vip": vip, "product_code": f"VIP{vip}"})))

    def mission(self, code):
        return next(m for m in missions.summary(self.owner["id"])["missions"] if m["id"] == code)

    def test_unmet_invalid_and_forged_amount(self):
        self.assertEqual(len(missions.summary(self.owner["id"])["missions"]), 9)
        for body in ({"mission_id": "unknown"}, {"mission_id": "purchase-vip4", "amount": 999999},
                     {"mission_id": []}, {}):
            with self.assertRaises(db.AuthError):
                missions.claim(self.owner["id"], body)
        with self.assertRaises(db.AuthError) as exc:
            missions.claim(self.owner["id"], {"mission_id": "purchase-vip4"})
        self.assertEqual(exc.exception.status, 409)

    def test_purchase_exactly_once_concurrent_and_independent_levels(self):
        self.purchase(self.owner, 4)
        body = {"mission_id": "purchase-vip4"}
        before = missions.summary(self.owner["id"])["balance_fcfa"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            result = list(pool.map(lambda _: missions.claim(self.owner["id"], body), range(6)))
        self.assertEqual(sum(not r["already_claimed"] for r in result), 1)
        after = missions.summary(self.owner["id"])
        self.assertEqual(after["balance_fcfa"], before + 500)
        self.assertEqual(after["claimed_total_fcfa"], 500)
        self.assertFalse(self.mission("purchase-vip5")["eligible"])
        self.assertTrue(self.mission("purchase-vip4")["claimed"])
        # Another purchase does not unlock a second reward for the same mission.
        self.purchase(self.owner, 4)
        self.assertTrue(missions.claim(self.owner["id"], body)["already_claimed"])

    def test_direct_investors_only_and_no_credit_before_claim(self):
        direct = [self.member(self.owner["referral_code"]) for _ in range(3)]
        indirect = self.member(direct[0]["referral_code"])
        self.purchase(indirect)
        self.assertEqual(self.mission("invite-3")["current"], 0)
        self.purchase(direct[0])
        self.purchase(direct[0], 5)
        self.assertEqual(self.mission("invite-3")["current"], 1)
        self.purchase(direct[1])
        self.assertFalse(self.mission("invite-3")["eligible"])
        self.purchase(direct[2])
        before = missions.summary(self.owner["id"])
        self.assertEqual(before["claimed_total_fcfa"], 0)
        self.assertTrue(self.mission("invite-3")["eligible"])
        response = missions.claim(self.owner["id"], {"mission_id": "invite-3"})
        self.assertEqual(response["balance_fcfa"], before["balance_fcfa"] + 1000)
        self.assertEqual(self.mission("invite-10")["current"], 3)
        self.assertFalse(self.mission("invite-10")["eligible"])
        for index in range(4, 31):
            self.purchase(self.member(self.owner["referral_code"]))
            if index == 9:
                self.assertFalse(self.mission("invite-10")["eligible"])
            if index == 10:
                self.assertTrue(self.mission("invite-10")["eligible"])
                self.assertEqual(missions.claim(self.owner["id"],
                    {"mission_id": "invite-10"})["amount_fcfa"], 3000)
            if index == 29:
                self.assertFalse(self.mission("invite-30")["eligible"])
        self.assertTrue(self.mission("invite-30")["eligible"])
        self.assertEqual(missions.claim(self.owner["id"],
                         {"mission_id": "invite-30"})["amount_fcfa"], 10000)
        self.assertEqual(missions.summary(self.owner["id"])["claimed_total_fcfa"], 14000)

    def test_all_purchase_rewards_and_account_isolation(self):
        other = self.member()
        self.purchase(other, 9)
        self.assertFalse(self.mission("purchase-vip9")["eligible"])
        for vip, amount in ((4, 500), (5, 1000), (6, 2500), (7, 5000), (8, 10000), (9, 20000)):
            self.purchase(self.owner, vip)
            self.assertEqual(missions.claim(self.owner["id"],
                                           {"mission_id": f"purchase-vip{vip}"})["amount_fcfa"], amount)
        self.assertEqual(missions.summary(self.owner["id"])["claimed_total_fcfa"], 39000)

    def test_blocked_and_failed_ledger_write_rollback(self):
        self.purchase(self.owner)
        reference = f"mission:{self.owner['id']}:purchase-vip4"
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO shineray_transactions
                (user_id,kind,label,amount_fcfa,provider_reference)
                VALUES (%s,'bonus','Conflict test',1,%s)""", (self.owner["id"], reference))
        before = missions.summary(self.owner["id"])["balance_fcfa"]
        with self.assertRaises(Exception):
            missions.claim(self.owner["id"], {"mission_id": "purchase-vip4"})
        self.assertEqual(missions.summary(self.owner["id"])["balance_fcfa"], before)
        with db.connect() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM shineray_transactions WHERE provider_reference=%s", (reference,))
            cur.execute("UPDATE shineray_users SET is_blocked=true WHERE id=%s", (self.owner["id"],))
        with self.assertRaises(db.AuthError):
            missions.claim(self.owner["id"], {"mission_id": "purchase-vip4"})
