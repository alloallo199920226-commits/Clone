"""Read-only, console-only provenance of settled ledger entries.

Never infer a real payment from a bonus, a balance or an unverified browser state.
Provider status below is the stored verification, not a fresh provider request.
"""

KINDS = {"all", "commission", "recharge", "withdrawal", "purchase", "income", "bonus"}


def history(cur, query):
    import admin_api

    kind = query.get("kind", "all")
    if kind not in KINDS:
        raise ValueError("Type de transaction invalide.")
    uid = query.get("user", "")
    if uid and (not uid.isascii() or not uid.isdecimal() or not 0 < int(uid) < 10**18):
        raise ValueError("Utilisateur invalide.")
    offset = admin_api.pagination(query.get("cursor", "0"))
    search = admin_api.text(query.get("search", ""), 120, False)
    params = {"uid": int(uid) if uid else None, "kind": kind,
              "pattern": "%" + search + "%", "limit": 31, "offset": offset}
    source = """
        FROM shineray_transactions t
        JOIN shineray_users u ON u.id=t.user_id
        LEFT JOIN shineray_deposit_approvals d ON d.id =
          CASE WHEN t.details->>'source_deposit_id' ~ '^[0-9]{1,18}$'
            THEN (t.details->>'source_deposit_id')::bigint
            WHEN t.details->>'deposit_id' ~ '^[0-9]{1,18}$'
            THEN (t.details->>'deposit_id')::bigint END
        LEFT JOIN shineray_users s ON s.id=d.user_id
        LEFT JOIN shineray_sonarapay_orders o
          ON d.provider_reference='sonarapay:'||o.provider_reference
        LEFT JOIN shineray_transactions p ON p.id =
          CASE WHEN t.details->>'purchase_id' ~ '^[0-9]{1,18}$'
            THEN (t.details->>'purchase_id')::bigint END AND p.user_id=t.user_id AND p.kind='purchase'
        LEFT JOIN shineray_withdrawal_requests w
          ON t.kind='withdrawal' AND t.provider_reference='RET-'||w.request_id::text
          AND w.user_id=t.user_id
        WHERE (%(uid)s::bigint IS NULL OR t.user_id=%(uid)s)
          AND (%(kind)s='all' OR t.kind=%(kind)s)
          AND (u.phone ILIKE %(pattern)s OR t.user_id::text ILIKE %(pattern)s
            OR s.phone ILIKE %(pattern)s OR t.provider_reference ILIKE %(pattern)s
            OR d.provider_reference ILIKE %(pattern)s OR t.label ILIKE %(pattern)s)
    """
    cur.execute("SELECT count(*) AS total " + source, params)
    total = cur.fetchone()["total"]
    cur.execute("""SELECT t.id,t.user_id,u.phone,t.kind,t.label,t.amount_fcfa,
        t.provider_reference,t.created_at,t.details,
        d.id AS deposit_id,d.user_id AS source_user_id,s.phone AS source_phone,
        d.amount_fcfa AS deposit_amount,d.provider_reference AS deposit_reference,
        d.approval_method,d.approved_by,d.approved_console,d.created_at AS approved_at,
        o.id AS payment_order_id,o.operator_id,o.payer_phone,o.status AS provider_status,
        o.initiated_at,o.checked_at,o.credited_at,
        p.id AS purchase_id,p.label AS purchase_name,p.created_at AS purchased_at,
        w.status AS withdrawal_status,w.created_at AS requested_at,w.reviewed_at
        """ + source + " ORDER BY t.created_at DESC,t.id DESC LIMIT %(limit)s OFFSET %(offset)s", params)
    rows = cur.fetchall()
    # Explicit allowlist: no raw JSON, channel credentials, cookies or secrets.
    allowed = {
        "level", "rate_percent", "base_amount_fcfa", "source_user_id", "source_deposit_id",
        "policy", "channel", "payer_number", "approval_method", "provider",
        "destination", "receiver_name", "net_amount_fcfa", "fee_fcfa",
        "product_id", "product_code", "product_name", "quantity", "validity_days",
        "daily_income_fcfa", "total_income_fcfa", "purchase_id", "period", "due_at",
        "admin_type", "admin_id", "request_id",
    }
    for row in rows:
        row["details"] = {k: v for k, v in (row["details"] or {}).items() if k in allowed}
    return admin_api.serialize({"transactions": rows[:30], "total": total,
                                "nextCursor": str(offset + 30) if len(rows) > 30 else None})
