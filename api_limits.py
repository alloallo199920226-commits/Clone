"""Persistent abuse throttles; no daily withdrawal quota or financial mutation."""
import hashlib
from datetime import datetime, timedelta, timezone

import auth_backend as db


def key(scope, subject):
    return hashlib.sha256(("api-rate-v1:" + scope + ":" + str(subject)).encode()).hexdigest()


def consume(scope, subject, *, limit, seconds):
    ident = key(scope, subject)
    denied = False
    # This table already backs authentication throttles. Use an isolated namespace;
    # never put IP addresses, session tokens or customer phone numbers in the row.
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute("SET LOCAL lock_timeout = '2s'")
        cur.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", ("api-rate:" + ident,))
        cur.execute("SELECT * FROM shineray_console_login_attempts WHERE client_hash=%s", (ident,))
        row = cur.fetchone()
        now = datetime.now(timezone.utc)
        active = row and now - row["window_start"] < timedelta(seconds=seconds)
        count = row["failures"] if active else 0
        denied = count >= limit
        if not denied:
            cur.execute("""INSERT INTO shineray_console_login_attempts
                (client_hash,failures,window_start,locked_until) VALUES (%s,%s,%s,NULL)
                ON CONFLICT(client_hash) DO UPDATE SET failures=EXCLUDED.failures,
                window_start=EXCLUDED.window_start,locked_until=NULL""",
                (ident, count + 1, row["window_start"] if active else now))
    if denied:
        raise db.AuthError(429, "Trop de requêtes rapprochées. Patientez avant de réessayer.")
