"""Dedicated console authentication, independent of every customer account."""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import auth_backend as db
from admin_assets import ADMIN_PATH


def client_key(handler, password):
    # Use the actual peer, not spoofable forwarded headers. Behind a shared
    # reverse proxy the limit is deliberately conservative (shared by peers).
    peer = str(handler.client_address[0])
    return hmac.new(password, ("console-client:" + peer).encode(), hashlib.sha256).hexdigest()


def require_console(cur, handler, token_hash, cookie_token, fail):
    token = cookie_token(handler)
    if not token or len(token) > 128:
        fail(401, "Saisissez le mot de passe réservé à l’administration.")
    cur.execute("""SELECT 1 FROM shineray_console_sessions
                   WHERE token_hash=%s AND expires_at>now()""", (token_hash(token),))
    if not cur.fetchone():
        fail(401, "Session administrateur expirée. Reconnectez-vous.")


def login(handler, body, *, configured_password, token_hash, cookie_token, cookie, audit, fail):
    if set(body) - {"path", "password"}:
        raise ValueError("Champs de requête inattendus.")
    if body.get("path") != ADMIN_PATH:
        fail(404, "Administration indisponible.")
    password = body.get("password")
    if not isinstance(password, str) or len(password) > 256 or len(password.encode()) > 1024:
        raise ValueError("Mot de passe invalide.")
    expected = configured_password()
    key = client_key(handler, expected)
    denied = limited = False
    with db.connect() as conn, conn.cursor() as cur:
        # Advisory lock also serializes the first attempt, before a row exists.
        cur.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", ("console-login:" + key,))
        cur.execute("SELECT * FROM shineray_console_login_attempts WHERE client_hash=%s", (key,))
        attempt = cur.fetchone()
        now = datetime.now(timezone.utc)
        if attempt and attempt["locked_until"] and attempt["locked_until"] > now:
            fail(429, "Trop de tentatives. Réessayez dans quinze minutes.")
        if not hmac.compare_digest(hashlib.sha256(password.encode()).digest(), hashlib.sha256(expected).digest()):
            denied = True
            failures = attempt["failures"] + 1 if attempt and now - attempt["window_start"] < timedelta(minutes=15) else 1
            limited = failures >= 5
            cur.execute("""INSERT INTO shineray_console_login_attempts(client_hash,failures,window_start,locked_until)
                           VALUES (%s,%s,%s,%s) ON CONFLICT(client_hash) DO UPDATE
                           SET failures=EXCLUDED.failures,window_start=EXCLUDED.window_start,
                           locked_until=EXCLUDED.locked_until""",
                        (key, failures, attempt["window_start"] if attempt and failures > 1 else now,
                         now + timedelta(minutes=15) if limited else None))
            audit(cur, None, "login_failed")
        else:
            cur.execute("DELETE FROM shineray_console_login_attempts WHERE client_hash=%s", (key,))
            previous = cookie_token(handler)
            if previous and len(previous) <= 128:
                cur.execute("DELETE FROM shineray_console_sessions WHERE token_hash=%s", (token_hash(previous, expected),))
            cur.execute("DELETE FROM shineray_console_sessions WHERE expires_at<=now()")
            token = secrets.token_urlsafe(32)
            cur.execute("INSERT INTO shineray_console_sessions(token_hash,expires_at) VALUES (%s,%s)",
                        (token_hash(token, expected), now + timedelta(hours=10)))
            audit(cur, None, "login_succeeded")
    # Commit failure counters before reporting a refused login.
    if denied:
        fail(429 if limited else 401, "Trop de tentatives. Réessayez dans quinze minutes." if limited
             else "Mot de passe administrateur incorrect.")
    handler._json(200, {"ok": True},
                  cookie=f"{cookie}={token}; Path=/; Max-Age=36000; HttpOnly; Secure; SameSite=Strict")
