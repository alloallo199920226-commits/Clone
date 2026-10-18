"""Bénin-only Payin orders; pending requests are not financial ledger entries."""
import logging
import re
import threading
import uuid
from decimal import Decimal, InvalidOperation

import auth_backend
import sonarapay_client as provider
from deposit_settlement import settle_approved_deposit
from financial_policy import MIN_DEPOSIT_FCFA

FINAL = {"successful", "failed"}
STATES = {"pending", "processing", "settling", "otp_required", "failed"}


def public(order):
    return {
        "id": str(order["id"]), "amount_fcfa": order["amount_fcfa"],
        "currency": "XOF", "countryCode": "+229", "operator": provider.OPERATORS[order["operator_id"]],
        "phone": order["payer_phone"], "status": order["status"],
        "reference": order["provider_reference"], "credited": order["credited_at"] is not None,
        "ussdCode": order["ussd_code"], "errorCode": order["last_error"],
        "created_at": order["created_at"].isoformat(),
    }


def identifier(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise ValueError("Référence de demande invalide.") from None


def load(user_id, ident):
    with auth_backend.connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT * FROM shineray_sonarapay_orders WHERE id=%s AND user_id=%s",
                    (identifier(ident), user_id))
        order = cur.fetchone()
    if order is None:
        raise auth_backend.AuthError(404, "Paiement introuvable.")
    return order


def recent(user_id):
    with auth_backend.connect() as conn, conn.cursor() as cur:
        cur.execute("""SELECT * FROM shineray_sonarapay_orders
                       WHERE user_id=%s ORDER BY created_at DESC LIMIT 100""", (user_id,))
        return [public(row) for row in cur.fetchall()]


def prepare(user, body):
    if not user["phone"].startswith("+229"):
        raise auth_backend.AuthError(403, "SonaraPay est réservé au Bénin pour le moment.")
    if not provider.configured():
        raise auth_backend.AuthError(503, "SonaraPay n’est pas configuré.")
    if set(body) - {"amount", "operatorId", "phone", "requestId"}:
        raise ValueError("Champs de demande inattendus.")
    amount = body.get("amount")
    operator = body.get("operatorId")
    phone = auth_backend.normalize_phone("+229", body.get("phone"))
    if not re.fullmatch(r"\+22901\d{8}", phone):
        raise ValueError("Le numéro béninois doit contenir 10 chiffres et commencer par 01.")
    if type(amount) is not int or not MIN_DEPOSIT_FCFA <= amount <= auth_backend.MAX_ACTIVITY_AMOUNT:
        raise ValueError(f"Montant invalide : de {MIN_DEPOSIT_FCFA} à {auth_backend.MAX_ACTIVITY_AMOUNT} FCFA.")
    if not isinstance(operator, str) or operator not in provider.DEPOSIT_OPERATORS:
        raise ValueError("Opérateur béninois invalide.")
    request_id = identifier(body.get("requestId"))
    with auth_backend.connect() as conn, conn.cursor() as cur:
        # One open request per member; serialize across replicas and drafts.
        cur.execute("SELECT id FROM shineray_users WHERE id=%s FOR NO KEY UPDATE", (user["id"],))
        cur.execute("""SELECT * FROM shineray_sonarapay_orders
                       WHERE user_id=%s AND request_id=%s""", (user["id"], request_id))
        order = cur.fetchone()
        if order:
            if (order["amount_fcfa"], order["operator_id"], order["payer_phone"]) != (amount, operator, phone):
                raise auth_backend.AuthError(409, "Cette demande existe déjà avec d’autres paramètres.")
            return order
        cur.execute("""SELECT * FROM shineray_sonarapay_orders WHERE user_id=%s
                       AND status NOT IN ('successful','failed') ORDER BY created_at LIMIT 1""", (user["id"],))
        order = cur.fetchone()
        if order:
            return order
        cur.execute("""SELECT count(*) total FROM shineray_sonarapay_orders
                       WHERE user_id=%s AND created_at>now()-interval '1 hour'""", (user["id"],))
        if cur.fetchone()["total"] >= 10:
            raise auth_backend.AuthError(429, "Trop de demandes de paiement. Réessayez plus tard.")
        cur.execute("""INSERT INTO shineray_sonarapay_orders
                       (id,user_id,request_id,amount_fcfa,operator_id,payer_phone,key_fingerprint)
                       VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
                    (str(uuid.uuid4()), user["id"], request_id, amount, operator, phone, provider.fingerprint()))
        return cur.fetchone()


def _claim(order, initiate=False):
    with auth_backend.connect() as conn, conn.cursor() as cur:
        cur.execute("""UPDATE shineray_sonarapay_orders SET lease_until=now()+interval '60 seconds',
                       checked_at=now(),
                       initiated_at=CASE WHEN %s THEN now() ELSE initiated_at END,
                       attempts=attempts+CASE WHEN %s THEN 1 ELSE 0 END
                       WHERE id=%s AND credited_at IS NULL AND status<>'failed'
                       AND (lease_until IS NULL OR lease_until<now())
                       AND ((%s AND attempts<12 AND
                             (initiated_at IS NULL OR initiated_at<now()-interval '5 seconds'))
                            OR (NOT %s AND (checked_at IS NULL OR checked_at<now()-interval '5 seconds')))
                       RETURNING *""", (initiate, initiate, order["id"], initiate, initiate))
        return cur.fetchone()


def _update(ident, *, status=None, reference=None, ussd=None, error=None, credited=False, release=True):
    with auth_backend.connect() as conn, conn.cursor() as cur:
        cur.execute("""UPDATE shineray_sonarapay_orders SET
                       status=COALESCE(%s,status),provider_reference=COALESCE(provider_reference,%s),
                       ussd_code=COALESCE(%s,ussd_code),last_error=%s,
                       lease_until=CASE WHEN %s THEN NULL ELSE lease_until END,
                       credited_at=CASE WHEN %s THEN COALESCE(credited_at,now()) ELSE credited_at END
                       WHERE id=%s""", (status, reference, ussd, error, release, credited, ident))


def _transaction(result):
    value = result.get("transaction")
    return value if isinstance(value, dict) else result


def _reference(result):
    return result.get("reference") or _transaction(result).get("reference")


def _amount_matches(value, expected):
    if isinstance(value, bool):
        return False
    try:
        return Decimal(str(value)).is_finite() and Decimal(str(value)) == Decimal(expected)
    except (InvalidOperation, ValueError):
        return False


def verified(order, result):
    tx = _transaction(result)
    if tx.get("status") != "successful" or _reference(result) != order["provider_reference"]:
        return False
    if "reference" in tx and tx["reference"] != order["provider_reference"]:
        return False
    if not _amount_matches(tx.get("amount"), order["amount_fcfa"]) or tx.get("currency") != "XOF":
        return False
    expected = {"description": "IVECO:" + str(order["id"]), "countryCode": "BJ",
                "operatorId": order["operator_id"], "customerPhone": order["payer_phone"]}
    # Some status responses omit these optional fields. If present, they must match.
    return all(key not in tx or tx[key] == value for key, value in expected.items())


def advance(order, *, initiate=False, otp=None):
    if order["status"] == "failed" or order["credited_at"]:
        return order
    claimed = _claim(order, initiate)
    if not claimed:
        if initiate:
            raise auth_backend.AuthError(429, "Une demande est déjà en cours ou la limite de tentatives est atteinte. Patientez au moins 5 secondes avant de réessayer.")
        return load(order["user_id"], order["id"])
    order = claimed
    try:
        if not provider.configured() or provider.fingerprint() != order["key_fingerprint"]:
            raise provider.ProviderError("credentials_changed")
        if not order["provider_reference"] or (otp and order["status"] == "otp_required"):
            if not initiate:
                # Unknown POSTs are retried explicitly with their original stable key.
                _update(order["id"], error=order["last_error"])
                return load(order["user_id"], order["id"])
            result = provider.create(order, otp)
            ref = _reference(result)
            if ref is not None and (not isinstance(ref, str) or not 1 <= len(ref) <= 110
                                    or re.search(r"[\x00-\x1f\x7f]", ref)):
                raise provider.ProviderError("invalid_response")
            if order["provider_reference"] and ref and order["provider_reference"] != ref:
                raise provider.ProviderError("reference_mismatch")
            needs_otp = result.get("requiresOtp") is True or _transaction(result).get("status") == "otp_required"
            ussd = result.get("ussdCode") or _transaction(result).get("ussdCode") or ""
            ussd = ussd if isinstance(ussd, str) and re.fullmatch(r"[*#\d+]{3,100}", ussd) else ""
            # Even a successful creation response is NOT proof of payment.
            _update(order["id"], status="otp_required" if needs_otp else "pending",
                    reference=ref, ussd=ussd, release=needs_otp or not ref)
            order = load(order["user_id"], order["id"])
            if needs_otp or not ref:
                if not needs_otp:
                    _update(order["id"], status="unknown", error="invalid_response")
                return load(order["user_id"], order["id"])
        result = provider.check(order["provider_reference"])
        state = _transaction(result).get("status")
        if state == "successful":
            if not verified(order, result):
                _update(order["id"], status="review", error="verification")
            else:
                # Shared settlement is atomic and reference-unique, including commissions.
                # A crash before marking this order is safe: settlement is idempotent.
                settle_approved_deposit(order["user_id"], order["amount_fcfa"],
                                        "sonarapay:" + order["provider_reference"],
                                        approval_method="automatic",
                                        receipt_details={"provider": "sonarapay",
                                                         "channel": "SonaraPay · " + provider.OPERATORS[order["operator_id"]]["operatorName"],
                                                         "payer_number": order["payer_phone"]})
                _update(order["id"], status="successful", credited=True)
        elif state in STATES:
            if _reference(result) != order["provider_reference"]:
                raise provider.ProviderError("reference_mismatch")
            _update(order["id"], status=state)
        else:
            raise provider.ProviderError("invalid_response")
    except provider.ProviderError as error:
        # An explicit initial 400/401/403 did not create a payable operation.
        # Timeouts/503s remain unresolved; never mark them failed or use a new key.
        rejected = (not order["provider_reference"] and not otp
                    and error.code in {"rejected", "credentials"})
        _update(order["id"], status="failed" if rejected else None, error=error.code)
    except Exception:
        # Do not log SQL, provider bodies, phone numbers, PINs, OTPs or credentials.
        _update(order["id"], error="verification")
        logging.warning("Vérification SonaraPay différée.")
    return load(order["user_id"], order["id"])


def handle(handler, user, route):
    if not route.startswith("/api/sonarapay/payments"):
        return False
    try:
        base = "/api/sonarapay/payments"
        if route == base and handler.command == "GET":
            result = {"payments": recent(user["id"])}
        elif route == base and handler.command == "POST":
            body = handler._read_json()
            if body is None:
                return True
            result = {"payment": public(advance(prepare(user, body), initiate=True))}
        elif route.startswith(base + "/") and handler.command in {"GET", "POST"}:
            suffix = route[len(base) + 1:].split("/")
            order = load(user["id"], suffix[0])
            if len(suffix) == 1 and handler.command == "GET":
                order = advance(order)
            elif len(suffix) == 2 and suffix[1] == "retry" and handler.command == "POST":
                body = handler._read_json()
                if body is None:
                    return True
                if set(body) - {"otp"}:
                    raise ValueError("Champs de demande inattendus.")
                otp = body.get("otp")
                if otp is not None and (not isinstance(otp, str) or not re.fullmatch(r"\d{4,12}", otp)):
                    raise ValueError("Code opérateur invalide.")
                if otp and order["status"] != "otp_required":
                    raise ValueError("Aucun code opérateur n’est attendu.")
                order = advance(order, initiate=True, otp=otp)
            else:
                raise auth_backend.AuthError(405, "Méthode non autorisée.")
            result = {"payment": public(order)}
        else:
            raise auth_backend.AuthError(405, "Méthode non autorisée.")
        handler._json(200, result)
    except auth_backend.AuthError as error:
        handler._json(error.status, {"error": error.message})
    except ValueError as error:
        handler._json(400, {"error": str(error)})
    except Exception:
        handler._json(503, {"error": "Service de paiement indisponible. Conservez votre demande et réessayez son suivi, sans lancer un autre paiement."})
    return True


def start_reconciliation():
    if not provider.configured():
        return
    def run():
        while True:
            try:
                with auth_backend.connect() as conn, conn.cursor() as cur:
                    cur.execute("""SELECT * FROM shineray_sonarapay_orders WHERE credited_at IS NULL
                                   AND status<>'failed' AND provider_reference IS NOT NULL
                                   AND key_fingerprint=%s
                                   AND (checked_at IS NULL OR checked_at<now()-interval '15 seconds')
                                   ORDER BY checked_at NULLS FIRST LIMIT 20""", (provider.fingerprint(),))
                    orders = cur.fetchall()
                for order in orders:
                    advance(order)
            except Exception:
                logging.warning("Suivi SonaraPay temporairement indisponible.")
            threading.Event().wait(15)
    threading.Thread(target=run, name="sonarapay-reconciliation", daemon=True).start()
