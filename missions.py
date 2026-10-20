"""One-time mission rewards, settled atomically in the existing ledger."""
from psycopg.types.json import Jsonb

import auth_backend as db
from withdrawals import available_balance


MISSIONS = tuple(
    {"id": f"invite-{target}", "type": "invitation",
     "title": f"Invitez {target} investisseurs de niveau 1",
     "target": target, "reward_fcfa": reward}
    for target, reward in ((3, 1000), (10, 3000), (30, 10000))
) + tuple(
    {"id": f"purchase-vip{vip}", "type": "purchase",
     "title": f"Achetez le produit VIP{vip}", "target": 1, "vip": vip,
     "reward_fcfa": reward}
    for vip, reward in ((4, 500), (5, 1000), (6, 2500), (7, 5000),
                        (8, 10000), (9, 20000))
)


def _state(cur, user_id):
    # Count each direct investor once. Free administrative grants are not purchases.
    cur.execute("""SELECT count(*) AS n FROM shineray_users u
        WHERE u.referred_by=%s AND EXISTS (
            SELECT 1 FROM shineray_transactions t WHERE t.user_id=u.id
            AND t.kind='purchase' AND t.amount_fcfa<0)""", (user_id,))
    investors = cur.fetchone()["n"]
    cur.execute("""SELECT details FROM shineray_transactions
        WHERE user_id=%s AND kind='purchase' AND amount_fcfa<0""", (user_id,))
    purchased = set()
    for row in cur.fetchall():
        details = row["details"] or {}
        vip = details.get("vip")
        if type(vip) is int and 1 <= vip <= 9:
            purchased.add(vip)
        code = details.get("product_code")
        if isinstance(code, str) and code in {f"VIP{i}" for i in range(1, 10)}:
            purchased.add(int(code[3:]))
    cur.execute("""SELECT provider_reference,amount_fcfa FROM shineray_transactions
        WHERE user_id=%s AND kind='bonus' AND details->>'source'='mission'""", (user_id,))
    receipts = cur.fetchall()
    claimed = {row["provider_reference"] for row in receipts}
    result = []
    for mission in MISSIONS:
        current = investors if mission["type"] == "invitation" else int(mission["vip"] in purchased)
        done = f"mission:{user_id}:{mission['id']}" in claimed
        result.append({**mission, "current": current, "claimed": done,
                       "eligible": current >= mission["target"] and not done})
    return {"missions": result,
            "claimed_total_fcfa": sum(row["amount_fcfa"] for row in receipts),
            "balance_fcfa": available_balance(cur, user_id)}


def _account(cur, user_id):
    cur.execute("SELECT id,is_banned,is_blocked FROM shineray_users WHERE id=%s FOR NO KEY UPDATE",
                (user_id,))
    user = cur.fetchone()
    if not user or user["is_banned"] or user["is_blocked"]:
        raise db.AuthError(403, "Compte indisponible.")


def summary(user_id):
    with db.connect() as conn, conn.cursor() as cur:
        _account(cur, user_id)
        return _state(cur, user_id)


def claim(user_id, body):
    if (not isinstance(body, dict) or set(body) != {"mission_id"}
            or not isinstance(body["mission_id"], str)
            or body["mission_id"] not in {m["id"] for m in MISSIONS}):
        raise db.AuthError(400, "Mission invalide.")
    with db.connect() as conn, conn.cursor() as cur:
        _account(cur, user_id)
        mission = next(m for m in _state(cur, user_id)["missions"] if m["id"] == body["mission_id"])
        reference = f"mission:{user_id}:{mission['id']}"
        if mission["claimed"]:
            cur.execute("SELECT amount_fcfa FROM shineray_transactions WHERE provider_reference=%s",
                        (reference,))
            return {"ok": True, "already_claimed": True,
                    "amount_fcfa": cur.fetchone()["amount_fcfa"],
                    "balance_fcfa": available_balance(cur, user_id)}
        if not mission["eligible"]:
            raise db.AuthError(409, "L’objectif de cette mission n’est pas encore atteint.")
        cur.execute("""INSERT INTO shineray_transactions
            (user_id,kind,label,amount_fcfa,provider_reference,details)
            VALUES (%s,'bonus',%s,%s,%s,%s)""",
                    (user_id, "Récompense mission : " + mission["title"],
                     mission["reward_fcfa"], reference,
                     Jsonb({"source": "mission", "mission_id": mission["id"]})))
        return {"ok": True, "already_claimed": False, "amount_fcfa": mission["reward_fcfa"],
                "balance_fcfa": available_balance(cur, user_id)}
