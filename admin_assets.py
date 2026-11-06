"""Serve original administration assets, never the bundle's server/private files.

Reading the original ZIP avoids reformatting or patching the supplied JavaScript.
The entry point also loads a separate responsive layout adapter.
"""

from functools import lru_cache
from pathlib import Path
from zipfile import ZipFile

ARCHIVE = Path(__file__).resolve().parent / "attached_assets/aeronova-administration-complete_1792229186027.zip"
PREFIX = "aeronova-admin/"
ADMIN_PATH = "omarshark-junior-panam"
ADMIN_ROUTE = "/" + ADMIN_PATH
ADMIN_SCRIPTS = {
    "general.js": "admin.js",
    "transaction-history.js": "transaction-history.js",
    "user-maintenance.js": "user-maintenance.js",
    "user-search.js": "user-search.js",
    "support-inbox.js": "support-inbox.js",
}
ADMIN_STYLES = {
    "styles.css": "admin.css",
    "runtime.css": "runtime.css",
    "admin-credit.css": "admin-credit.css",
    "history.css": "history.css",
}
COMPAT_LINK = b'<link rel="stylesheet" href="/admin-ui/import-compat.css?v=1">'


@lru_cache(maxsize=100)
def browser_asset(route):
    if route in {"/admin-ui/transaction-trace.js", "/admin-ui/transaction-trace.css"}:
        suffix = route.rsplit(".", 1)[1]
        asset = Path(__file__).resolve().parent / ("pages/admin-transaction-trace." + suffix)
        return asset.read_bytes(), ("text/javascript" if suffix == "js" else "text/css") + "; charset=utf-8"
    if route in {"/admin-ui/customer-reset.js", "/admin-ui/customer-reset.css"}:
        suffix = "js" if route.endswith(".js") else "css"
        asset = Path(__file__).resolve().parent / ("pages/admin-customer-reset." + suffix)
        return asset.read_bytes(), ("text/javascript" if suffix == "js" else "text/css") + "; charset=utf-8"
    if route == "/admin-ui/today-withdrawals.js":
        script = Path(__file__).resolve().parent / "pages/admin-today-withdrawals.js"
        return script.read_bytes(), "text/javascript; charset=utf-8"
    if route == "/admin-ui/import-compat.css":
        stylesheet = Path(__file__).resolve().parent / "pages/admin-import-compat.css"
        return stylesheet.read_bytes(), "text/css; charset=utf-8"
    member = None
    content_type = None
    if route in {ADMIN_ROUTE, ADMIN_ROUTE + "/"}:
        member, content_type = "administration/index.html", "text/html; charset=utf-8"
    elif route.startswith("/admin-ui/"):
        name = route.removeprefix("/admin-ui/")
        if name in ADMIN_SCRIPTS:
            member = "administration/" + ADMIN_SCRIPTS[name]
            content_type = "text/javascript; charset=utf-8"
        elif name in ADMIN_STYLES:
            member = "administration/styles/" + ADMIN_STYLES[name]
            content_type = "text/css; charset=utf-8"
    elif route.startswith("/sprite-assets/"):
        name = route.removeprefix("/sprite-assets/")
        suffix = Path(name).suffix
        # The ZIP is a source bundle, not a directory to serve indiscriminately.
        if "/" not in name and "\\" not in name and suffix in {".css", ".svg", ".png", ".webp"}:
            member = "sprite-assets/" + name
            content_type = {
                ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
                ".png": "image/png", ".webp": "image/webp",
            }[suffix]
        elif name == "stripe-pay-brand.js":
            member, content_type = "sprite-assets/" + name, "text/javascript; charset=utf-8"
    if not member:
        return None
    with ZipFile(ARCHIVE) as bundle:
        try:
            info = bundle.getinfo(PREFIX + member)
        except KeyError:
            return None
        if info.file_size > 2_000_000:
            return None
        body = bundle.read(info)
        if member == "administration/index.html":
            body = body.replace(b"</head>", b'<link rel="stylesheet" href="/admin-ui/transaction-trace.css?v=1"></head>', 1)
            body = body.replace(b"</body>", b'<script src="/admin-ui/transaction-trace.js?v=1" defer></script></body>', 1)
            # Add a separate layout adapter, leaving every original asset intact.
            body = body.replace(b"</head>", COMPAT_LINK + b"</head>", 1)
            body = body.replace(b"</body>", b'<script src="/admin-ui/today-withdrawals.js?v=1"></script></body>', 1)
            body = body.replace(b"</head>", b'<link rel="stylesheet" href="/admin-ui/customer-reset.css?v=2"></head>', 1)
            body = body.replace(b"</body>", b'<script src="/admin-ui/customer-reset.js?v=1" defer></script></body>', 1)
        return body, content_type
