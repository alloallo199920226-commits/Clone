"""Serve the uploaded administration verbatim, never its server/private files.

Reading the original ZIP avoids reformatting or patching the supplied JavaScript.
Only the browser entry point and explicitly public assets are exposed.
"""

from functools import lru_cache
from pathlib import Path
from zipfile import ZipFile

ARCHIVE = Path(__file__).resolve().parent / "attached_assets/aeronova-administration-complete_1792229186027.zip"
PREFIX = "aeronova-admin/"
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


@lru_cache(maxsize=100)
def browser_asset(route):
    member = None
    content_type = None
    if route in {"/administration", "/administration/"}:
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
        return bundle.read(info), content_type
