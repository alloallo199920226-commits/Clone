"""Serve the imported SHINERAY pages without exposing workspace files."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
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


class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.respond(send_body=False)

    def do_GET(self):
        self.respond()

    def respond(self, send_body=True):
        route = unquote(urlsplit(self.path).path)
        directory = PAGES.get(route)
        file_path = ROOT / directory / "code.html" if directory else None
        content_type = "text/html; charset=utf-8"
        if file_path is None:
            for folder in PAGES.values():
                allowed_files = {"code.html": "text/html; charset=utf-8", "screen.png": "image/png"}
                if folder == "page_d_accueil_shineray":
                    allowed_files["modern-suv-hero.jpg"] = "image/jpeg"
                if folder in {"connexion", "inscription"}:
                    allowed_files.update({"auth.css": "text/css; charset=utf-8", "auth.js": "text/javascript; charset=utf-8"})
                for filename, media_type in allowed_files.items():
                    if route != f"/{folder}/{filename}":
                        continue
                    file_path = ROOT / route.lstrip("/")
                    content_type = media_type
                    break
                if file_path is not None:
                    break
        if file_path is None or not file_path.is_file():
            self.send_error(404)
            return
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if send_body:
            self.wfile.write(body)


if __name__ == "__main__":
    print("SHINERAY listening on 0.0.0.0:5000", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 5000), Handler).serve_forever()
