"""Development-only wallet persistence; no money is sent."""
import os
import secrets
import unittest

import auth_backend as db


@unittest.skipUnless(os.environ.get("RUN_ACCOUNT_INTEGRATION_TESTS") == "1", "Development DB opt-in")
class WalletOperatorTests(unittest.TestCase):
    def setUp(self):
        self.users = []

    def tearDown(self):
        with db.connect() as conn, conn.cursor() as cur:
            for uid in self.users:
                cur.execute("DELETE FROM shineray_wallets WHERE user_id=%s", (uid,))
                cur.execute("DELETE FROM shineray_transactions WHERE user_id=%s", (uid,))
                cur.execute("DELETE FROM shineray_users WHERE id=%s", (uid,))

    def member(self, prefix):
        local = "".join(str(secrets.randbelow(10)) for _ in range(db.PHONE_LENGTHS[prefix]))
        _, user, _ = db.register(prefix, local, "wallet-operator-fixture")
        self.users.append(user["id"])
        return user, local

    def test_all_operators_all_eligible_country_formats_and_duplicates(self):
        for prefix in db.PHONE_LENGTHS:
            user, local = self.member(prefix)
            for provider in ("TOGOCEL", "MOOV", "MTN", "ORANGE", "AIRTEL", "WAVE"):
                with self.subTest(country=prefix, provider=provider):
                    wallet = db.add_wallet(user["id"], provider, local, "Nom du titulaire")
                    self.assertEqual(wallet["phone"], prefix+local)
                    self.assertEqual(wallet["provider"], provider)
                    with self.assertRaisesRegex(ValueError, "déjà enregistré"):
                        db.add_wallet(user["id"], provider, prefix+local, "Nom du titulaire")
            self.assertEqual(len(db.get_wallets(user["id"])), 6)

    def test_validation_and_ownership(self):
        user, local = self.member("+229")
        other, _ = self.member("+228")
        wallet = db.add_wallet(user["id"], "MTN", local, "Titulaire")
        for provider, phone, holder in (("UNKNOWN", local, "Titulaire"), (None, local, "Titulaire"),
                                         ("MTN", "123", "Titulaire"), ("MOOV", local, "")):
            with self.assertRaises(ValueError):
                db.add_wallet(user["id"], provider, phone, holder)
        self.assertFalse(db.delete_wallet(other["id"], wallet["id"]))
        self.assertEqual(db.get_wallets(other["id"]), [])
        self.assertTrue(db.delete_wallet(user["id"], wallet["id"]))
