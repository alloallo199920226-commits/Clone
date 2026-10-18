"""Atomic settlement shared by authorized manual and verified provider approvals.

Automatic entry is a trusted Python service, NOT a public callback. A future
provider adapter must authenticate and verify its event before calling it.
"""
import json
import re

import auth_backend
from financial_policy import MIN_DEPOSIT_FCFA, REFERRAL_PERCENTAGES


def settle_approved_deposit(user_id, amount_fcfa, provider_reference, *,
                            approval_method, approved_by=None, console_handler=None):
    if type(user_id) is not int or type(amount_fcfa) is not int:
        raise ValueError("Compte ou montant invalide.")
    if not MIN_DEPOSIT_FCFA <= amount_fcfa <= auth_backend.MAX_ACTIVITY_AMOUNT:
        raise ValueError(f"Le dépôt minimum est de {MIN_DEPOSIT_FCFA} FCFA.")
    if not isinstance(provider_reference, str):
        raise ValueError("Référence de paiement invalide.")
    reference = provider_reference.strip()
    if not 1 <= len(reference) <= 120 or re.search(r"[\x00-\x1f\x7f]", reference):
        raise ValueError("Renseignez la référence réelle du paiement (120 caractères maximum).")
    if approval_method not in ("manual", "automatic"):
        raise ValueError("Mode d’approbation invalide.")
    if approval_method == "automatic" and (approved_by is not None or console_handler is not None):
        raise ValueError("Une validation automatique doit provenir du prestataire vérifié.")

    with auth_backend.connect() as connection, connection.cursor() as cursor:
        if approval_method == "manual":
            if console_handler is not None and approved_by is None:
                import admin_api
                admin_api.require_admin(cursor, console_handler)
            else:
                cursor.execute("SELECT is_admin FROM shineray_users WHERE id = %s", (approved_by,))
                actor = cursor.fetchone()
                if not actor or not actor["is_admin"]:
                    raise auth_backend.AuthError(403, "Accès réservé à l’administration.")
        # Serialize ALL approved deposits for this member, including concurrent
        # callbacks with different references. NO KEY UPDATE allows FK inserts.
        cursor.execute("SELECT id, referred_by FROM shineray_users WHERE id = %s FOR NO KEY UPDATE", (user_id,))
        member = cursor.fetchone()
        if not member:
            raise ValueError("Compte bénéficiaire introuvable.")
        cursor.execute(
            """INSERT INTO shineray_deposit_approvals
               (user_id, amount_fcfa, provider_reference, approval_method, approved_by, approved_console)
               VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT (provider_reference) DO NOTHING
               RETURNING id""",
            (user_id, amount_fcfa, reference, approval_method, approved_by, console_handler is not None),
        )
        approval = cursor.fetchone()
        if approval is None:
            cursor.execute("SELECT id, user_id, amount_fcfa FROM shineray_deposit_approvals WHERE provider_reference = %s", (reference,))
            previous = cursor.fetchone()
            if previous["user_id"] != user_id or previous["amount_fcfa"] != amount_fcfa:
                raise ValueError("Cette référence est déjà liée à un autre dépôt.")
            return {"id": previous["id"], "already_approved": True}
        deposit_id = approval["id"]
        if console_handler is not None:
            admin_api.audit(cursor, None, "approve_deposit", {"deposit_id": deposit_id})
        # Legacy settled recharges count as earlier deposits, but are not
        # retroactively commissioned by this policy.
        cursor.execute(
            """SELECT EXISTS(SELECT 1 FROM shineray_transactions
               WHERE user_id=%s AND kind='recharge' AND amount_fcfa>0) AS prior""", (user_id,))
        first = not cursor.fetchone()["prior"]
        if first:
            cursor.execute(
                """INSERT INTO shineray_first_deposits (user_id,deposit_id)
                   VALUES (%s,%s) ON CONFLICT DO NOTHING RETURNING user_id""", (user_id, deposit_id))
            first = cursor.fetchone() is not None
        cursor.execute(
            """INSERT INTO shineray_transactions
               (user_id,kind,label,amount_fcfa,provider_reference,details)
               VALUES (%s,'recharge','Dépôt approuvé',%s,%s,%s::jsonb)""",
            (user_id, amount_fcfa, f"approved-deposit:{reference}",
             json.dumps({"deposit_id": deposit_id, "approval_method": approval_method,
                         "channel": "Validation administrative" if approval_method == "manual" else "Prestataire vérifié"})),
        )
        ancestor = member["referred_by"]
        visited = {user_id}
        if first:
            for level, rate in enumerate(REFERRAL_PERCENTAGES, 1):
                if ancestor is None or ancestor in visited:
                    break
                visited.add(ancestor)
                cursor.execute("SELECT referred_by FROM shineray_users WHERE id=%s", (ancestor,))
                parent = cursor.fetchone()
                if parent is None:
                    break
                # Floor fractional FCFA: never use floating-point money.
                reward = amount_fcfa * rate // 100
                cursor.execute(
                    """INSERT INTO shineray_transactions
                       (user_id,kind,label,amount_fcfa,provider_reference,details)
                       VALUES (%s,'commission',%s,%s,%s,%s::jsonb)""",
                    (ancestor, f"Commission niveau {level}", reward,
                     f"first-deposit:{deposit_id}:level:{level}",
                     json.dumps({"source_user_id": user_id, "source_deposit_id": deposit_id,
                                 "level": level, "rate_percent": rate,
                                 "base_amount_fcfa": amount_fcfa, "policy": "first-approved-deposit"})),
                )
                ancestor = parent["referred_by"]
        return {"id": deposit_id, "already_approved": False, "first_deposit": first}


def approve_manual_deposit(admin_id, phone, amount_fcfa, reference, *, console_handler=None):
    # Only normalized full account numbers; do not expose a directory of users.
    phone = str(phone or "").strip()
    if not re.fullmatch(r"\+225\d{10}|\+228\d{8}", phone):
        raise ValueError("Indiquez le numéro complet du compte avec +225 ou +228.")
    with auth_backend.connect() as connection, connection.cursor() as cursor:
        cursor.execute("SELECT id FROM shineray_users WHERE phone=%s", (phone,))
        user = cursor.fetchone()
    if user is None:
        raise ValueError("Compte bénéficiaire introuvable.")
    return settle_approved_deposit(user["id"], amount_fcfa, reference,
                                   approval_method="manual", approved_by=admin_id,
                                   console_handler=console_handler)
