"""Phone/password authentication and persistent account data."""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import threading
import time
from datetime import datetime, timezone

import psycopg
from psycopg.errors import UniqueViolation
from psycopg.rows import dict_row
from financial_policy import WELCOME_BONUS_FCFA, MIN_DEPOSIT_FCFA, REFERRAL_PERCENTAGES

PASSWORD_ITERATIONS = 310_000
SESSION_DAYS = 7
DEFAULT_SESSION_DAYS = 1
PHONE_LENGTHS = {"+228": 8, "+225": 10, "+229": 10, "+226": 8, "+227": 8, "+237": 9}
COUNTRY_NAMES = {
    "+228": "Togo", "+225": "Côte d’Ivoire", "+229": "Bénin",
    "+226": "Burkina Faso", "+227": "Niger", "+237": "Cameroun",
}
ACTIVITY_KINDS = {"recharge", "withdrawal", "purchase"}
MIN_ACTIVITY_AMOUNTS = {"recharge": MIN_DEPOSIT_FCFA, "withdrawal": 2_200, "purchase": 4_000}
MAX_ACTIVITY_AMOUNT = 500_000_000
_DUMMY_SALT = b"\x00" * 16
_DUMMY_HASH = hashlib.pbkdf2_hmac("sha256", b"not-a-real-password", _DUMMY_SALT, PASSWORD_ITERATIONS)
_login_failures: dict[str, list[float]] = {}
_login_lock = threading.Lock()


class AuthError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


class PhoneAlreadyRegistered(Exception):
    pass


def connect():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("Database is not configured")
    return psycopg.connect(database_url, connect_timeout=5, row_factory=dict_row)


def normalize_phone(country_code: str, phone: str) -> str:
    country_code = str(country_code or "").strip()
    if country_code not in PHONE_LENGTHS:
        raise ValueError("Choisissez un pays éligible dans la liste.")
    digits = re.sub(r"\D", "", str(phone or ""))
    country_digits = country_code[1:]
    expected_length = PHONE_LENGTHS[country_code]
    if len(digits) == expected_length + len(country_digits) and digits.startswith(country_digits):
        digits = digits[len(country_digits):]
    if len(digits) != expected_length:
        raise ValueError("Vérifiez le numéro de téléphone saisi.")
    return f"{country_code}{digits}"


def _password_bytes(password: str) -> bytes:
    if not isinstance(password, str) or len(password) < 8 or len(password) > 256:
        raise ValueError("Le mot de passe doit contenir entre 8 et 256 caractères.")
    encoded = password.encode("utf-8")
    if len(encoded) > 1024:
        raise ValueError("Le mot de passe est trop long.")
    return encoded


def _hash_password(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", _password_bytes(password), salt, PASSWORD_ITERATIONS)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def _create_session(cursor, user_id: int, remember: bool = False) -> tuple[str, int]:
    cursor.execute("DELETE FROM shineray_sessions WHERE expires_at <= CURRENT_TIMESTAMP")
    token = secrets.token_urlsafe(32)
    session_days = SESSION_DAYS if remember else DEFAULT_SESSION_DAYS
    cursor.execute(
        """
        INSERT INTO shineray_sessions (token_hash, user_id, expires_at)
        VALUES (%s, %s, CURRENT_TIMESTAMP + (%s * INTERVAL '1 day'))
        """,
        (_token_hash(token), user_id, session_days),
    )
    return token, session_days


def register(country_code: str, phone: str, password: str, referral_code: str = "") -> tuple[str, dict, int]:
    normalized = normalize_phone(country_code, phone)
    referral_code = str(referral_code or "").strip().upper()
    if referral_code and not re.fullmatch(r"[A-Z0-9]{6,10}", referral_code):
        raise ValueError("Code de parrainage invalide.")
    salt = secrets.token_bytes(16)
    password_hash = _hash_password(password, salt)
    try:
        with connect() as connection, connection.cursor() as cursor:
            referrer = None
            if referral_code:
                cursor.execute("SELECT id FROM shineray_users WHERE referral_code = %s", (referral_code,))
                referrer = cursor.fetchone()
                if not referrer:
                    raise ValueError("Ce code de parrainage n’existe pas.")
            cursor.execute(
                """
                INSERT INTO shineray_users (phone, password_salt, password_hash, referred_by)
                VALUES (%s, %s, %s, %s)
                RETURNING id, phone
                """,
                (normalized, salt, password_hash, referrer["id"] if referrer else None),
            )
            user = cursor.fetchone()
            cursor.execute(
                """INSERT INTO shineray_transactions
                   (user_id, kind, label, amount_fcfa, provider_reference, details)
                   VALUES (%s, 'bonus', 'Bonus de bienvenue', %s, %s,
                           '{"policy":"welcome"}'::jsonb)""",
                (user["id"], WELCOME_BONUS_FCFA, f"welcome:{user['id']}"),
            )
            token, session_days = _create_session(cursor, user["id"])
    except UniqueViolation as exc:
        raise PhoneAlreadyRegistered from exc
    return token, {"id": user["id"], "phone": user["phone"]}, session_days


def _rate_limit_key(phone: str) -> str:
    return hashlib.sha256(phone.encode("utf-8")).hexdigest()


def _record_login_failure(phone: str) -> bool:
    now = time.monotonic()
    key = _rate_limit_key(phone)
    with _login_lock:
        if len(_login_failures) > 5_000:
            for old_key, values in list(_login_failures.items()):
                recent = [instant for instant in values if now - instant < 900]
                if recent:
                    _login_failures[old_key] = recent
                else:
                    _login_failures.pop(old_key, None)
        attempts = [instant for instant in _login_failures.get(key, []) if now - instant < 900]
        attempts.append(now)
        _login_failures[key] = attempts
        return len(attempts) >= 8


def _clear_login_failures(phone: str) -> None:
    with _login_lock:
        _login_failures.pop(_rate_limit_key(phone), None)


def login(country_code: str, phone: str, password: str, remember: bool = False) -> tuple[str, dict, int]:
    normalized = normalize_phone(country_code, phone)
    password_input = _password_bytes(password)
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT id, phone, password_salt, password_hash, is_banned, is_blocked FROM shineray_users WHERE phone = %s",
            (normalized,),
        )
        user = cursor.fetchone()
        salt = bytes(user["password_salt"]) if user else _DUMMY_SALT
        expected = bytes(user["password_hash"]) if user else _DUMMY_HASH
        actual = hashlib.pbkdf2_hmac("sha256", password_input, salt, PASSWORD_ITERATIONS)
        if not user or not hmac.compare_digest(actual, expected):
            limited = _record_login_failure(normalized)
            if limited:
                raise AuthError(429, "Trop de tentatives. Réessayez dans quelques minutes.")
            raise AuthError(401, "Numéro ou mot de passe incorrect.")
        _clear_login_failures(normalized)
        if user["is_banned"] or user["is_blocked"]:
            raise AuthError(403, "Ce compte est banni." if user["is_banned"] else "Ce compte est bloqué.")
        token, session_days = _create_session(cursor, user["id"], remember)
    return token, {"id": user["id"], "phone": user["phone"]}, session_days


def get_user_for_session(token: str | None) -> dict | None:
    if not token or len(token) > 128:
        return None
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT u.id, u.phone, u.is_admin
            FROM shineray_sessions s
            JOIN shineray_users u ON u.id = s.user_id
            WHERE s.token_hash = %s AND s.expires_at > CURRENT_TIMESTAMP
              AND NOT u.is_banned AND NOT u.is_blocked
            """,
            (_token_hash(token),),
        )
        return cursor.fetchone()


def revoke_session(token: str | None) -> None:
    if not token or len(token) > 128:
        return
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute("DELETE FROM shineray_sessions WHERE token_hash = %s", (_token_hash(token),))


def account_summary(user_id: int) -> dict:
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            """SELECT u.id, u.phone, u.referral_code, u.is_admin,
                      COALESCE((SELECT SUM(t.amount_fcfa) FROM shineray_transactions t
                                WHERE t.user_id = u.id), 0)::bigint AS balance_fcfa
               FROM shineray_users u WHERE u.id = %s""",
            (user_id,),
        )
        return cursor.fetchone()


def get_activity(user_id: int, kind: str | None = None) -> list[dict]:
    if kind is not None and kind not in ACTIVITY_KINDS:
        raise ValueError("Filtre d’historique invalide.")
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            """SELECT id, kind, label, abs(amount_fcfa) AS amount_fcfa,
                      created_at, provider_reference, details
               FROM shineray_transactions
               WHERE user_id = %s AND (%s::text IS NULL OR kind = %s)
               ORDER BY created_at DESC, id DESC LIMIT 101""",
            (user_id, kind, kind),
        )
        rows = cursor.fetchall()
    return [
        {"id": row["id"], "kind": row["kind"], "label": row["label"],
         "amount_fcfa": row["amount_fcfa"], "created_at": row["created_at"].isoformat(),
         "reference": row["provider_reference"], "status": "succeeded",
         "channel": row["details"].get("channel") if isinstance(row["details"].get("channel"), str) else None,
         "net_amount_fcfa": _receipt_number(row["details"], "net_amount_fcfa")}
        for row in rows
    ]


def _receipt_number(details: dict, key: str, minimum: int = 0, maximum: int = 999_999_999_999_999) -> int | None:
    value = details.get(key)
    return value if type(value) is int and minimum <= value <= maximum else None


def get_products(user_id: int) -> dict:
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            """SELECT id, label, abs(amount_fcfa) AS amount_fcfa, created_at, details
               FROM shineray_transactions WHERE user_id = %s AND kind = 'purchase'
               ORDER BY created_at DESC, id DESC LIMIT 100""", (user_id,),
        )
        rows = cursor.fetchall()
        cursor.execute(
            """SELECT COALESCE(SUM(quantity), 0)::bigint AS quantity,
                      CASE WHEN COUNT(*) = COUNT(income)
                           THEN COALESCE(SUM(income), 0)::bigint END AS income_fcfa,
                      COUNT(*) > 100 AS has_more
               FROM (
                 SELECT CASE WHEN jsonb_typeof(details->'quantity') = 'number'
                                  AND details->>'quantity' ~ '^[1-9][0-9]{0,5}$'
                             THEN (details->>'quantity')::bigint ELSE 1 END AS quantity,
                        CASE WHEN jsonb_typeof(details->'income_fcfa') = 'number'
                                  AND details->>'income_fcfa' ~ '^[0-9]{1,15}$'
                             THEN (details->>'income_fcfa')::bigint END AS income
                 FROM shineray_transactions WHERE user_id = %s AND kind = 'purchase'
               ) AS owned""", (user_id,),
        )
        summary = cursor.fetchone()
        cursor.execute("""SELECT id,product_snapshot,created_at,expires_at,status
            FROM shineray_admin_vip_grants
            WHERE user_id=%s AND status='active' AND expires_at>now()
            ORDER BY created_at DESC LIMIT 101""", (user_id,))
        grants = cursor.fetchall()
        cursor.execute("""SELECT count(*)::bigint count FROM shineray_admin_vip_grants
            WHERE user_id=%s AND status='active' AND expires_at>now()""", (user_id,))
        grant_count = cursor.fetchone()["count"]
    products = []
    for row in rows:
        details = row["details"]
        vip = _receipt_number(details, "vip", 1, 12)
        products.append({
            "id": row["id"], "name": f"VIP{vip}" if vip is not None else row["label"],
            "vip": vip, "amount_fcfa": row["amount_fcfa"],
            "quantity": _receipt_number(details, "quantity", 1, 999_999) or 1,
            "created_at": row["created_at"].isoformat(),
            "daily_income_fcfa": _receipt_number(details, "daily_income_fcfa"),
            "total_income_fcfa": _receipt_number(details, "total_income_fcfa"),
            "validity_days": _receipt_number(details, "validity_days", 1, 365_000),
            "income_fcfa": _receipt_number(details, "income_fcfa"),
        })
    for grant in grants[:100]:
        product = grant["product_snapshot"]
        vip_match = re.fullmatch(r"VIP([1-9]|1[0-2])", product.get("code", ""))
        products.append({
            "id": f"grant-{grant['id']}", "name": product["name"],
            "vip": int(vip_match[1]) if vip_match else None, "amount_fcfa": 0,
            "quantity": 1, "created_at": grant["created_at"].isoformat(),
            "daily_income_fcfa": product["dailyIncome"], "total_income_fcfa": product["totalIncome"],
            "validity_days": product["durationDays"], "income_fcfa": 0, "source": "admin_grant",
        })
    summary["quantity"] += grant_count
    summary["has_more"] = summary["has_more"] or len(grants) > 100
    return {**summary, "products": products[:100]}


def get_team(user_id: int) -> dict:
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            """WITH RECURSIVE team AS (
                 SELECT id, 1 AS level FROM shineray_users WHERE referred_by = %s
                 UNION ALL
                 SELECT u.id, t.level + 1 FROM shineray_users u
                 JOIN team t ON u.referred_by = t.id WHERE t.level < 3
               ) SELECT level, count(*) AS count FROM team GROUP BY level""",
            (user_id,),
        )
        counts = {row["level"]: row["count"] for row in cursor.fetchall()}
        cursor.execute(
            """WITH RECURSIVE team AS (
                 SELECT id, phone, created_at, 1 AS level
                 FROM shineray_users WHERE referred_by = %s
                 UNION ALL
                 SELECT u.id, u.phone, u.created_at, t.level + 1
                 FROM shineray_users u JOIN team t ON u.referred_by = t.id
                 WHERE t.level < 3
               ), ranked AS (
                 SELECT *, row_number() OVER (
                   PARTITION BY level ORDER BY created_at DESC, id DESC
                 ) AS rank FROM team
               ) SELECT r.phone, r.created_at, r.level,
                        COALESCE((SELECT SUM(abs(t.amount_fcfa))
                                  FROM shineray_transactions t
                                  WHERE t.user_id = r.id AND t.kind = 'purchase'), 0)::bigint
                        AS investment_fcfa
                 FROM ranked r WHERE rank <= 100
                 ORDER BY r.level, r.created_at DESC, r.id DESC""",
            (user_id,),
        )
        members = [
            {"level": row["level"],
             "phone_masked": row["phone"][4:6] + "****" + row["phone"][-3:],
             "created_at": row["created_at"].isoformat(),
             "investment_fcfa": row["investment_fcfa"]}
            for row in cursor.fetchall()
        ]
        cursor.execute(
            """WITH RECURSIVE team AS (
                 SELECT id, 1 AS level FROM shineray_users WHERE referred_by = %s
                 UNION ALL
                 SELECT u.id, t.level + 1 FROM shineray_users u
                 JOIN team t ON u.referred_by = t.id WHERE t.level < 3
               ) SELECT team.level, SUM(c.amount_fcfa)::bigint AS revenue
                 FROM shineray_transactions c
                 LEFT JOIN team ON c.details->>'source_user_id' = team.id::text
                 WHERE c.user_id = %s AND c.kind = 'commission'
                 GROUP BY team.level""",
            (user_id, user_id),
        )
        by_level = {row["level"]: row["revenue"] for row in cursor.fetchall()}
        revenue = sum(by_level.values())
    return {"levels": [counts.get(level, 0) for level in (1, 2, 3)],
            "total": sum(counts.values()), "revenue_fcfa": revenue,
            "level_revenue_fcfa": [None if by_level.get(None, 0) else by_level.get(level, 0)
                                   for level in (1, 2, 3)],
            "members_has_more": any(count > 100 for count in counts.values()),
            "members": members,
            "referral_percentages": list(REFERRAL_PERCENTAGES),
            "commission_basis": "first_approved_deposit"}


def get_wallets(user_id: int) -> list[dict]:
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT id, provider, phone, holder_name FROM shineray_wallets WHERE user_id = %s ORDER BY id",
            (user_id,),
        )
        return cursor.fetchall()


def add_wallet(user_id: int, provider: str, phone: str, holder_name: str | None = None) -> dict:
    if provider != "TOGOCEL":
        raise ValueError("Sélectionnez TOGOCEL.")
    if not isinstance(holder_name, str) or any(ord(char) < 32 for char in holder_name):
        raise ValueError("Saisissez le nom du titulaire du compte.")
    holder_name = " ".join(holder_name.split())
    if not holder_name or len(holder_name) > 120:
        raise ValueError("Le nom du titulaire doit contenir entre 1 et 120 caractères.")
    normalized = normalize_phone("+228", phone)
    try:
        with connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """INSERT INTO shineray_wallets (user_id, provider, phone, holder_name)
                   VALUES (%s, %s, %s, %s) RETURNING id, provider, phone, holder_name""",
                (user_id, provider, normalized, holder_name),
            )
            return cursor.fetchone()
    except UniqueViolation as exc:
        raise ValueError("Ce compte de retrait est déjà enregistré.") from exc


def delete_wallet(user_id: int, wallet_id: int) -> bool:
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute("DELETE FROM shineray_wallets WHERE id = %s AND user_id = %s", (wallet_id, user_id))
        return cursor.rowcount == 1


def record_demo_activity(user_id: int, kind: str, amount_fcfa: int, label: str) -> dict:
    if kind not in ACTIVITY_KINDS:
        raise ValueError("Type d’opération invalide.")
    if (
        not isinstance(amount_fcfa, int)
        or isinstance(amount_fcfa, bool)
        or not MIN_ACTIVITY_AMOUNTS[kind] <= amount_fcfa <= MAX_ACTIVITY_AMOUNT
    ):
        raise ValueError("Montant invalide.")
    safe_label = re.sub(r"[\x00-\x1f\x7f]", "", str(label or "")).strip()[:80]
    if not safe_label:
        safe_label = {"recharge": "Recharge simulée", "withdrawal": "Retrait simulé", "purchase": "Achat simulé"}[kind]
    with connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO shineray_demo_activity (user_id, kind, label, amount_fcfa)
            VALUES (%s, %s, %s, %s)
            RETURNING id, kind, label, amount_fcfa, created_at
            """,
            (user_id, kind, safe_label, amount_fcfa),
        )
        activity = cursor.fetchone()
    return _serialize_activity(activity)


def get_demo_activity(user_id: int, kind: str | None = None) -> list[dict]:
    if kind is not None and kind not in ACTIVITY_KINDS:
        raise ValueError("Filtre d’historique invalide.")
    with connect() as connection, connection.cursor() as cursor:
        if kind:
            cursor.execute(
                """
                SELECT id, kind, label, amount_fcfa, created_at
                FROM shineray_demo_activity
                WHERE user_id = %s AND kind = %s
                ORDER BY created_at DESC LIMIT 100
                """,
                (user_id, kind),
            )
        else:
            cursor.execute(
                """
                SELECT id, kind, label, amount_fcfa, created_at
                FROM shineray_demo_activity
                WHERE user_id = %s
                ORDER BY created_at DESC LIMIT 100
                """,
                (user_id,),
            )
        return [_serialize_activity(row) for row in cursor.fetchall()]


def _serialize_activity(activity: dict) -> dict:
    created_at = activity["created_at"]
    if isinstance(created_at, datetime):
        created_at = created_at.astimezone(timezone.utc).isoformat()
    return {
        "id": activity["id"],
        "kind": activity["kind"],
        "label": activity["label"],
        "amount_fcfa": activity["amount_fcfa"],
        "created_at": created_at,
        "simulated": True,
    }
