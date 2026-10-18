"""Server-only SonaraPay SDK Payin transport. Never log payloads or credentials."""
import hashlib
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, build_opener, HTTPRedirectHandler

BASE_URL = "https://sonarapay.app"
OPERATORS = {
    "mtn_bj": {"id": "mtn_bj", "operatorName": "MTN", "logoText": "MTN", "logoColor": "#ffdd00"},
    "moov_bj": {"id": "moov_bj", "operatorName": "MOOV", "logoText": "MOOV", "logoColor": "#1483bc"},
    "celtiis_bj": {"id": "celtiis_bj", "operatorName": "Celtiis Cash", "logoText": "Celtiis", "logoColor": "#10b981"},
    "orange_bf": {"id": "orange_bf", "operatorName": "Orange Money", "logoText": "Orange", "logoColor": "#f97316"},
    "moov_bf": {"id": "moov_bf", "operatorName": "Moov Money", "logoText": "MOOV", "logoColor": "#3b82f6"},
    "telecel_bf": {"id": "telecel_bf", "operatorName": "Telecel Cash", "logoText": "Telecel", "logoColor": "#ef4444"},
    "tmoney_tg": {"id": "tmoney_tg", "operatorName": "T-Money (Togocom)", "logoText": "T-Money", "logoColor": "#facc15"},
    "moov_tg": {"id": "moov_tg", "operatorName": "Moov Money Togo (Flooz)", "logoText": "MOOV", "logoColor": "#3b82f6"},
}
# Keep the full catalog for existing orders, but allow only these for new deposits.
COUNTRY_CODES = {"+229": "BJ", "+226": "BF", "+228": "TG"}
DEPOSIT_OPERATORS = {key: OPERATORS[key] for key in
                     ("mtn_bj", "moov_bj", "tmoney_tg", "moov_tg")}


def country_prefix(phone):
    return next((prefix for prefix in COUNTRY_CODES if str(phone).startswith(prefix)), None)


def deposit_operators(phone):
    code = COUNTRY_CODES.get(country_prefix(phone))
    return {key: value for key, value in DEPOSIT_OPERATORS.items()
            if code and key.endswith("_" + code.lower())}


class ProviderError(Exception):
    def __init__(self, code="unavailable"):
        self.code = code
        super().__init__(code)


class NoRedirects(HTTPRedirectHandler):
    # Do not forward Api-Key or a POST to a redirected destination.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def configured():
    return bool(os.environ.get("SONARAPAY_KEY", "").strip())


def fingerprint():
    return hashlib.sha256(os.environ.get("SONARAPAY_KEY", "").strip().encode()).hexdigest()


def request(method, path, payload=None, idempotency_key=None):
    key = os.environ.get("SONARAPAY_KEY", "").strip()
    if not key:
        raise ProviderError("not_configured")
    headers = {"Api-Key": key, "Accept": "application/json", "User-Agent": "IVECO-Pay/1.0"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode()
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    req = Request(BASE_URL + path, data=data, headers=headers, method=method)
    try:
        with build_opener(NoRedirects()).open(req, timeout=20) as response:
            raw = response.read(131_073)
    except HTTPError as error:
        # OTP-required responses may be returned with HTTP 400.
        try:
            value = json.loads(error.read(131_072))
        except (ValueError, UnicodeError, OSError):
            value = None
        if error.code == 400 and isinstance(value, dict) and value.get("requiresOtp") is True:
            return value
        if error.code in (401, 403):
            # An HTML gateway denial is not evidence that the SDK key is invalid.
            raise ProviderError("credentials" if isinstance(value, dict) else "access_blocked") from None
        raise ProviderError("rejected"
                            if error.code == 400 else "unavailable") from None
    except (URLError, TimeoutError, OSError):
        # The POST may have reached SonaraPay. Retry ONLY this same order/key.
        raise ProviderError("unavailable") from None
    if len(raw) > 131_072:
        raise ProviderError("invalid_response")
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeError):
        raise ProviderError("invalid_response") from None
    if not isinstance(value, dict):
        raise ProviderError("invalid_response")
    return value


def create(order, otp=None):
    country = COUNTRY_CODES.get(country_prefix(order["payer_phone"]))
    if not country or order["operator_id"] not in OPERATORS or not order["operator_id"].endswith("_" + country.lower()):
        raise ProviderError("invalid_country")
    payload = {
        "amount": order["amount_fcfa"], "currency": "XOF", "countryCode": country,
        "operatorId": order["operator_id"], "customerPhone": order["payer_phone"],
        "description": "IVECO:" + str(order["id"]),
    }
    if otp:
        payload["otp"] = otp
    return request("POST", "/api/public/v1/payments", payload, "iveco-" + str(order["id"]))


def check(reference):
    return request("GET", "/api/public/v1/payments/" + quote(reference, safe=""))
