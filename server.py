"""Serve the IVECO pages and a small, authenticated application API."""

import json
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

import auth_backend
import admin_assets
import admin_api
import sonarapay_payments
import sonarapay_client
import manual_deposits
from platform_brand import with_iveco_brand

ROOT = Path(__file__).resolve().parent
SESSION_COOKIE = "shineray_session"
PAGES = {
    "/": "connexion",
    "/accueil": "page_d_accueil_shineray",
    "/projet": "projet_mes_produits_shineray",
    "/equipe": "quipe_parrainage_shineray",
    "/compte": "mon_compte_le_mien_shineray",
    "/notifications": "notification_de_la_plateforme_shineray",
    "/connexion": "connexion",
    "/inscription": "inscription",
}
MORE_PAGES = {
    "/administration-depots": "administration-depots.html",
    "/choisir-operateur": "choisir-operateur.html",
    "/confirmation-depot": "confirmation-depot.html",
    "/mon-equipe": "mon-equipe.html",
    "/financement": "financement.html",
    "/recharger": "recharger.html",
    "/retrait": "retrait.html",
    "/historique-recharges": "historique-recharges.html",
    "/historique-retraits": "historique-retraits.html",
    "/gestion-compte-bancaire": "gestion-compte-bancaire.html",
    "/ajouter-compte-retrait": "ajouter-compte-retrait.html",
    "/a-propos": "a-propos.html",
    "/regles": "regles.html",
    "/service-client": "service-client.html",
}
STATIC_FILES = {
    "/pages/iveco-brand.js": ("pages/iveco-brand.js", "text/javascript; charset=utf-8"),
    "/pages/form-controls.css": ("pages/form-controls.css", "text/css; charset=utf-8"),
    "/pages/admin-deposits.js": ("pages/admin-deposits.js", "text/javascript; charset=utf-8"),
    "/pages/deposit-flow.css": ("pages/deposit-flow.css", "text/css; charset=utf-8"),
    "/pages/iveco-payment.css": ("pages/iveco-payment.css", "text/css; charset=utf-8"),
    "/pages/iveco-confirmation.css": ("pages/iveco-confirmation.css", "text/css; charset=utf-8"),
    "/pages/deposit-flow.js": ("pages/deposit-flow.js", "text/javascript; charset=utf-8"),
    "/pages/sonarapay.js": ("pages/sonarapay.js", "text/javascript; charset=utf-8"),
    "/pages/deposit-i18n.js": ("pages/deposit-i18n.js", "text/javascript; charset=utf-8"),
    "/pages/navigation-loading.css": ("pages/navigation-loading.css", "text/css; charset=utf-8"),
    "/pages/navigation-loading.js": ("pages/navigation-loading.js", "text/javascript; charset=utf-8"),
    "/pages/records-reference.css": ("pages/records-reference.css", "text/css; charset=utf-8"),
    "/pages/records-reference.js": ("pages/records-reference.js", "text/javascript; charset=utf-8"),
    "/pages/auth-progress.js": ("pages/auth-progress.js", "text/javascript; charset=utf-8"),
    "/pages/member-reference.css": ("pages/member-reference.css", "text/css; charset=utf-8"),
    "/pages/iveco-about.css": ("pages/iveco-about.css", "text/css; charset=utf-8"),
    "/pages/team-reference.css": ("pages/team-reference.css", "text/css; charset=utf-8"),
    "/pages/home-reference.css": ("pages/home-reference.css", "text/css; charset=utf-8"),
    "/pages/home-reference.js": ("pages/home-reference.js", "text/javascript; charset=utf-8"),
    "/pages/payment-reference.css": ("pages/payment-reference.css", "text/css; charset=utf-8"),
    "/pages/payment-reference.js": ("pages/payment-reference.js", "text/javascript; charset=utf-8"),
    "/pages/account.css": ("pages/account.css", "text/css; charset=utf-8"),
    "/pages/notification.css": ("pages/notification.css", "text/css; charset=utf-8"),
    "/pages/country-picker.js": ("pages/country-picker.js", "text/javascript; charset=utf-8"),
    "/pages/pages.css": ("pages/pages.css", "text/css; charset=utf-8"),
    "/pages/pages.js": ("pages/pages.js", "text/javascript; charset=utf-8"),
    "/pages/notification.js": ("pages/notification.js", "text/javascript; charset=utf-8"),
    "/pages/team.js": ("pages/team.js", "text/javascript; charset=utf-8"),
}
PUBLIC_AUTH_PAGES = {"/", "/connexion", "/inscription"}

def with_form_controls(body, content_type):
    """Apply the same field behavior to every HTML route, including admin."""
    if content_type.startswith("text/html"):
        return body.replace(
            b"</head>",
            b'<link rel="stylesheet" href="/pages/form-controls.css?v=1"></head>',
            1,
        )
    return body


class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.respond(send_body=False)

    def do_GET(self):
        if urlsplit(self.path).path.startswith("/api/"):
            self.handle_api()
        else:
            self.respond()

    def do_POST(self):
        self.handle_api()

    def do_DELETE(self):
        self.handle_api()

    def do_PATCH(self):
        self.handle_api()

    def respond(self, send_body=True):
        route = unquote(urlsplit(self.path).path)
        imported = admin_assets.browser_asset(route)
        if imported:
            body, content_type = imported
            body = with_form_controls(body, content_type)
            body = with_iveco_brand(body, content_type)
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Robots-Tag", "noindex, nofollow, noarchive")
            self.send_header("Referrer-Policy", "same-origin")
            self.end_headers()
            if send_body:
                self.wfile.write(body)
            return
        file_path, content_type = self.resolve_file(route)
        if file_path is None or not file_path.is_file():
            self.send_error(404)
            return

        if route == "/administration-depots":
            try:
                with auth_backend.connect() as conn, conn.cursor() as cur:
                    admin_api.require_admin(cur, self)
            except auth_backend.AuthError:
                self._redirect(admin_assets.ADMIN_ROUTE)
                return
            except Exception:
                self._json(503, {"error": "Vérification administrateur temporairement indisponible."})
                return
        elif route in PAGES or route in MORE_PAGES:
            try:
                user = auth_backend.get_user_for_session(self._session_token())
            except Exception:
                self._json(503, {"error": "Le service est temporairement indisponible."})
                return
            if route in PUBLIC_AUTH_PAGES and user:
                self._redirect("/accueil")
                return
            if route not in PUBLIC_AUTH_PAGES and not user:
                self._redirect("/connexion")
                return
            if route == "/" and user:
                self._redirect("/accueil")
                return

        try:
            body = file_path.read_bytes()
        except OSError:
            self.send_error(404)
            return
        if content_type.startswith("text/html") and route not in PUBLIC_AUTH_PAGES:
            navigation_assets = (
                b'<link rel="stylesheet" href="/pages/navigation-loading.css">'
                b'<script src="/pages/navigation-loading.js"></script>'
            )
            body = body.replace(b"<head>", b"<head>" + navigation_assets, 1)
        body = with_form_controls(body, content_type)
        body = with_iveco_brand(body, content_type)
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.end_headers()
        if send_body:
            self.wfile.write(body)

    def resolve_file(self, route):
        directory = PAGES.get(route)
        if directory:
            return ROOT / directory / "code.html", "text/html; charset=utf-8"
        if route in MORE_PAGES:
            return ROOT / "pages" / MORE_PAGES[route], "text/html; charset=utf-8"
        if route in STATIC_FILES:
            relative_path, content_type = STATIC_FILES[route]
            return ROOT / relative_path, content_type
        if route.startswith("/pages/assets/"):
            candidate = (ROOT / route.lstrip("/")).resolve()
            if candidate.is_relative_to(ROOT / "pages" / "assets") and candidate.name in {"empty-records.svg", "team-avatar.svg"}:
                return candidate, "image/svg+xml"
            if candidate.is_relative_to(ROOT / "pages" / "assets") and candidate.suffix in {".jpg", ".jpeg", ".png"}:
                return candidate, "image/png" if candidate.suffix == ".png" else "image/jpeg"
        if route == "/pages/reference.css":
            return ROOT / "pages/reference.css", "text/css; charset=utf-8"
        for folder in set(PAGES.values()):
            allowed_files = {
                "screen.png": "image/png",
            }
            if folder == "page_d_accueil_shineray":
                allowed_files["modern-suv-hero.jpg"] = "image/jpeg"
            if folder in {"connexion", "inscription"}:
                allowed_files.update({
                    "auth.css": "text/css; charset=utf-8",
                    "auth.js": "text/javascript; charset=utf-8",
                })
            for filename, media_type in allowed_files.items():
                if route == f"/{folder}/{filename}":
                    return ROOT / folder / filename, media_type
        return None, None

    def handle_api(self):
        route = unquote(urlsplit(self.path).path)
        if not route.startswith("/api/"):
            self._json(404, {"error": "Page introuvable."})
            return

        if route in {"/api/country-picker/config", "/api/countries"}:
            if self.command != "GET":
                self._json(405, {"error": "Méthode non autorisée."})
            elif route.endswith("/config"):
                self._json(200, {"countries_url": "/api/countries"})
            else:
                self._json(200, {"countries": [
                    {"code": code, "name": name, "phone_length": auth_backend.PHONE_LENGTHS[code]}
                    for code, name in auth_backend.COUNTRY_NAMES.items()
                ]})
            return

        if self.command not in {"GET", "HEAD"}:
            if not self._is_same_origin():
                self._json(403, {"error": "Requête refusée."})
                return

        if route in {"/api/auth/register", "/api/auth/login"}:
            if self.command != "POST":
                self._json(405, {"error": "Méthode non autorisée."})
                return
            payload = self._read_json()
            if payload is None:
                return
            try:
                if route.endswith("/register"):
                    token, user, session_days = auth_backend.register(
                        payload.get("country_code"),
                        payload.get("phone"),
                        payload.get("password"),
                        payload.get("referral_code", ""),
                    )
                    status = 201
                else:
                    token, user, session_days = auth_backend.login(
                        payload.get("country_code"),
                        payload.get("phone"),
                        payload.get("password"),
                        remember=payload.get("remember") is True,
                    )
                    status = 200
                self._json(
                    status,
                    {"user": user},
                    cookie=self._session_cookie(token, session_days),
                )
            except auth_backend.PhoneAlreadyRegistered:
                self._json(409, {"error": "Ce numéro possède déjà un compte."})
            except auth_backend.AuthError as exc:
                self._json(exc.status, {"error": exc.message})
            except ValueError as exc:
                self._json(400, {"error": str(exc)})
            except Exception:
                self._json(503, {"error": "Impossible de créer la session pour le moment."})
            return

        if route == "/api/auth/logout":
            if self.command != "POST":
                self._json(405, {"error": "Méthode non autorisée."})
                return
            try:
                auth_backend.revoke_session(self._session_token())
                self._json(
                    200,
                    {"ok": True},
                    cookie=f"{SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
                )
            except Exception:
                self._json(503, {"error": "Impossible de fermer la session pour le moment."})
            return

        # Console authentication is independent of customer login and flags.
        if route.startswith("/api/admin/"):
            admin_api.handle(self, None, route)
            return

        try:
            user = auth_backend.get_user_for_session(self._session_token())
        except Exception:
            self._json(503, {"error": "Le service est temporairement indisponible."})
            return
        if not user:
            self._json(401, {"error": "Connexion requise."})
            return

        if route == "/api/me" and self.command == "GET":
            try:
                self._json(200, auth_backend.account_summary(user["id"]))
            except Exception:
                self._json(503, {"error": "Impossible de charger le compte."})
            return

        if route == "/api/payment-channels/me":
            if self.command != "GET":
                self._json(405, {"error": "Méthode non autorisée."})
                return
            try:
                prefix = next((code for code in auth_backend.PHONE_LENGTHS
                               if user["phone"].startswith(code)), None)
                automatic_channels = [
                    {**channel, "provider": "sonarapay"}
                    for channel in sonarapay_client.deposit_operators(prefix).values()
                ] if sonarapay_client.configured() else []
                if automatic_channels and prefix != "+225":
                    self._json(200, {"countryCode": prefix, "phoneLength": auth_backend.PHONE_LENGTHS[prefix],
                                     "provider": "sonarapay",
                                     "channels": automatic_channels})
                    return
                with auth_backend.connect() as connection, connection.cursor() as cursor:
                    cursor.execute(
                        """SELECT id,value FROM shineray_admin_resources
                           WHERE kind='channel' AND value->>'countryCode'=%s
                           AND value->'isActive'='true'::jsonb
                           ORDER BY COALESCE((value->>'sortOrder')::int,0),id""", (prefix,))
                    channels = [{
                        "id": row["id"],
                        **{key: row["value"].get(key, "") for key in
                           ("operatorName", "receiverNumber", "receiverName", "ussdTemplate",
                            "logoColor", "logoText", "logoUrl")},
                    } for row in cursor.fetchall()]
                self._json(200, {"countryCode": prefix,
                                 "phoneLength": auth_backend.PHONE_LENGTHS.get(prefix),
                                 "provider": "mixed" if automatic_channels else "manual",
                                 "channels": automatic_channels + [
                                     {**channel, "provider": "manual"} for channel in channels
                                     if not automatic_channels or "wave" in channel["operatorName"].casefold()
                                 ]})
            except Exception:
                self._json(503, {"error": "Impossible de charger les moyens de paiement."})
            return

        if route == "/api/withdrawals":
            if self.command != "POST":
                self._json(405, {"error": "Méthode non autorisée."})
                return
            body = self._read_json()
            if body is None:
                return
            import withdrawals
            try:
                self._json(201, {"withdrawal": withdrawals.submit(user["id"], body)})
            except auth_backend.AuthError as exc:
                self._json(exc.status, {"error": exc.message})
            except ValueError as exc:
                self._json(400, {"error": str(exc)})
            except Exception:
                self._json(503, {"error": "Enregistrement non confirmé. Réessayez la même demande ou vérifiez votre historique."})
            return

        if route == "/api/manual-deposits":
            if self.command != "POST":
                self._json(405, {"error": "Méthode non autorisée."})
                return
            body = self._read_json()
            if body is None:
                return
            try:
                self._json(201, {"deposit": manual_deposits.submit(user, body)})
            except auth_backend.AuthError as exc:
                self._json(exc.status, {"error": exc.message})
            except ValueError as exc:
                self._json(400, {"error": str(exc)})
            except Exception:
                self._json(503, {"error": "Enregistrement non confirmé. Réessayez la même demande, sans refaire le transfert."})
            return

        if sonarapay_payments.handle(self, user, route):
            return

        if route == "/api/team" and self.command == "GET":
            try:
                self._json(200, auth_backend.get_team(user["id"]))
            except Exception:
                self._json(503, {"error": "Impossible de charger l’équipe."})
            return

        if route == "/api/wallets":
            try:
                if self.command == "GET":
                    self._json(200, {"wallets": auth_backend.get_wallets(user["id"])})
                elif self.command == "POST":
                    payload = self._read_json()
                    if payload is not None:
                        self._json(201, {"wallet": auth_backend.add_wallet(
                            user["id"], payload.get("provider"), payload.get("phone"), payload.get("holder_name"))})
                else:
                    self._json(405, {"error": "Méthode non autorisée."})
            except ValueError as exc:
                self._json(400, {"error": str(exc)})
            except Exception:
                self._json(503, {"error": "Impossible de charger ou enregistrer le compte de retrait."})
            return

        if route.startswith("/api/wallets/") and self.command == "DELETE":
            try:
                deleted = auth_backend.delete_wallet(user["id"], int(route.rsplit("/", 1)[1]))
                self._json(200 if deleted else 404, {"ok": deleted})
            except ValueError:
                self._json(400, {"error": "Compte invalide."})
            except Exception:
                self._json(503, {"error": "Suppression impossible."})
            return

        if route == "/api/activity" and self.command == "GET":
            kind = parse_qs(urlsplit(self.path).query).get("kind", [None])[0]
            try:
                activities = auth_backend.get_activity(user["id"], kind)
                self._json(200, {"activities": activities[:100], "has_more": len(activities) > 100})
            except ValueError as exc:
                self._json(400, {"error": str(exc)})
            except Exception:
                self._json(503, {"error": "Impossible de charger l’historique pour le moment."})
            return

        if route == "/api/products" and self.command == "GET":
            try:
                self._json(200, auth_backend.get_products(user["id"]))
            except Exception:
                self._json(503, {"error": "Impossible de charger vos produits pour le moment."})
            return

        if route == "/api/products/catalog" and self.command == "GET":
            import vip_purchases
            try:
                self._json(200, vip_purchases.available())
            except auth_backend.AuthError as exc:
                self._json(exc.status, {"error": exc.message})
            except Exception:
                self._json(503, {"error": "Catalogue indisponible pour le moment."})
            return

        if route == "/api/products/purchase" and self.command == "POST":
            import vip_purchases
            body = self._read_json()
            if body is None:
                return
            try:
                self._json(200, vip_purchases.purchase(user["id"], body))
            except auth_backend.AuthError as exc:
                self._json(exc.status, {"error": exc.message})
            except ValueError as exc:
                self._json(400, {"error": str(exc)})
            except Exception:
                self._json(503, {"error": "Réponse d’achat indisponible. Vérifiez vos produits ou réessayez la même demande, sans créer un nouvel achat."})
            return

        if route in {"/api/demo-activity", "/api/payments"} and self.command == "POST":
            self._json(503, {"error": "Paiements indisponibles : aucun prestataire de paiement n’est connecté. Aucun montant n’a été débité ou crédité."})
            return

        self._json(404, {"error": "Page introuvable."})

    def _read_json(self):
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type != "application/json":
            self._json(415, {"error": "Format de requête non pris en charge."})
            return None
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._json(400, {"error": "Requête invalide."})
            return None
        if length < 1 or length > 16_384:
            self._json(413 if length > 16_384 else 400, {"error": "Taille de requête invalide."})
            return None
        try:
            payload = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json(400, {"error": "Requête invalide."})
            return None
        if not isinstance(payload, dict):
            self._json(400, {"error": "Requête invalide."})
            return None
        return payload

    def _is_same_origin(self):
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "").lower()
        if not origin or not host:
            return False
        parsed = urlsplit(origin)
        return parsed.scheme in {"http", "https"} and parsed.netloc.lower() == host

    def _session_token(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
            morsel = cookie.get(SESSION_COOKIE)
            return morsel.value if morsel else None
        except Exception:
            return None

    @staticmethod
    def _session_cookie(token, session_days):
        max_age = session_days * 24 * 60 * 60
        return f"{SESSION_COOKIE}={token}; Max-Age={max_age}; Path=/; HttpOnly; Secure; SameSite=Lax"

    def _json(self, status, payload, cookie=None):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def _redirect(self, target):
        self.send_response(302)
        self.send_header("Location", target)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()


if __name__ == "__main__":
    sonarapay_payments.start_reconciliation()
    print("IVECO listening on 0.0.0.0:5000", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 5000), Handler).serve_forever()
