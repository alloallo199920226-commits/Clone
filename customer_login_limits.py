"""Persistent customer throttling, using the existing private attempts store."""
import hashlib
from datetime import datetime, timedelta, timezone

from auth_backend import AuthError

WINDOW = timedelta(minutes=15)
MAX_FAILURES = 8


def key(phone):
    # Separate namespace from dedicated console keys; no phone stored in this table.
    return hashlib.sha256(("customer-login:" + phone).encode()).hexdigest()


def begin(cur, phone):
    ident = key(phone)
    cur.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", ("customer-login:" + ident,))
    cur.execute("SELECT * FROM shineray_console_login_attempts WHERE client_hash=%s", (ident,))
    attempt = cur.fetchone()
    now = datetime.now(timezone.utc)
    if attempt and attempt["locked_until"] and attempt["locked_until"] > now:
        raise AuthError(429, "Trop de tentatives. Réessayez dans quinze minutes.")
    return ident, attempt, now


def failed(cur, ident, attempt, now):
    failures = attempt["failures"] + 1 if attempt and now - attempt["window_start"] < WINDOW else 1
    limited = failures >= MAX_FAILURES
    cur.execute("""INSERT INTO shineray_console_login_attempts
                   (client_hash,failures,window_start,locked_until) VALUES (%s,%s,%s,%s)
                   ON CONFLICT(client_hash) DO UPDATE SET failures=EXCLUDED.failures,
                   window_start=EXCLUDED.window_start,locked_until=EXCLUDED.locked_until""",
                (ident, failures, attempt["window_start"] if failures > 1 else now,
                 now + WINDOW if limited else None))
    return limited
