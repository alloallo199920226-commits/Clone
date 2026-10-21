"""Durable manual schedule overrides, recorded in the administration audit log."""
EVENT = "withdrawal_schedule"
LOCK_ID = 732684129
MODES = {"scheduled", "open", "closed"}


def current_mode(cur):
    cur.execute("""SELECT details->>'mode' AS mode FROM shineray_admin_audit
                   WHERE event_type=%s ORDER BY id DESC LIMIT 1""", (EVENT,))
    row = cur.fetchone()
    if not row:
        return "scheduled"
    if row["mode"] not in MODES:
        raise ValueError("Configuration des horaires de retrait invalide.")
    return row["mode"]


def flags(cur):
    mode = current_mode(cur)
    return {"mode": mode, "withdrawOpenOverride": mode == "open",
            "withdrawClosedOverride": mode == "closed"}


def update(cur, actor, body):
    if not isinstance(body, dict) or set(body) != {"mode"} or not isinstance(
            body["mode"], str) or body["mode"] not in MODES:
        raise ValueError("Choisissez open, closed ou scheduled.")
    # Serialize mode changes with submissions, across workers and replicas.
    cur.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK_ID,))
    import admin_api
    admin_api.audit(cur, actor, EVENT, {"mode": body["mode"]})
    return {"ok": True, **flags(cur)}


def enforce(cur):
    cur.execute("SELECT pg_advisory_xact_lock_shared(%s)", (LOCK_ID,))
    mode = current_mode(cur)
    import auth_backend
    import withdrawals
    if mode == "closed":
        raise auth_backend.AuthError(403, "Les demandes de retrait sont temporairement fermées.")
    if mode == "scheduled" and not withdrawals.withdrawal_window_open():
        raise auth_backend.AuthError(403, "Les demandes de retrait sont ouvertes de 10 h à 18 h, heure du Maroc.")
