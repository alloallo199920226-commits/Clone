import unittest

import auth_backend


class PhoneNormalizationTests(unittest.TestCase):
    def test_normalizes_country_code_and_separators(self):
        self.assertEqual(
            auth_backend.normalize_phone("+225", "225 01 02 03 04 05"),
            "+2250102030405",
        )
        self.assertEqual(
            auth_backend.normalize_phone("+228", "90 12 34 56"),
            "+22890123456",
        )

    def test_rejects_unsupported_country_and_wrong_length(self):
        with self.assertRaises(ValueError):
            auth_backend.normalize_phone("+33", "612345678")
        with self.assertRaises(ValueError):
            auth_backend.normalize_phone("+228", "9012345")


class PasswordTests(unittest.TestCase):
    def test_password_hash_matches_only_the_same_password(self):
        salt = b"0123456789abcdef"
        expected = auth_backend._hash_password("strong-enough-password", salt)
        self.assertTrue(
            auth_backend.hmac.compare_digest(
                expected,
                auth_backend._hash_password("strong-enough-password", salt),
            )
        )
        self.assertFalse(
            auth_backend.hmac.compare_digest(
                expected,
                auth_backend._hash_password("different-password", salt),
            )
        )

    def test_password_length_is_validated(self):
        with self.assertRaises(ValueError):
            auth_backend._hash_password("short", b"0123456789abcdef")


if __name__ == "__main__":
    unittest.main()
