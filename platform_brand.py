"""NARKE presentation adapter; stored identities and financial scripts stay intact."""

from html import escape
from html.parser import HTMLParser
import re

BRAND_SCRIPT = b'<script src="/pages/narke-brand.js?v=narke2" defer></script>'
FAVICON_LINKS = (
    b'<link rel="icon" type="image/x-icon" href="/favicon.ico?v=narke2">'
    b'<link rel="icon" type="image/png" sizes="64x64" href="/pages/assets/narke-favicon.png?v=narke2">'
    b'<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=narke2">'
)
BRAND_META = (
    b'<meta name="theme-color" content="#00131e">'
    b'<meta name="application-name" content="NARKE Industries">'
    b'<meta name="apple-mobile-web-app-title" content="NARKE">'
    b'<meta property="og:site_name" content="NARKE Industries">'
    b'<meta property="og:type" content="website">'
    b'<link rel="manifest" href="/manifest.webmanifest?v=narke2">'
)
LEGACY_BRAND = re.compile(r"\b(?:IVECO|SHINERAY|SWM|Sprite|AERONOVA|Valhalla)\b", re.I)
LOGOS = {
    "/pages/assets/iveco-auth-logo.png": "/pages/assets/narke-home-logo.png",
    "/pages/assets/iveco-logo.png": "/pages/assets/narke-home-logo.png",
}


def brand_text(value):
    return LEGACY_BRAND.sub("NARKE", re.sub(r"\biveco\s*pay\b", "NARKE Pay", value, flags=re.I))


class BrandHTML(HTMLParser):
    """Only transform presentation, not identifiers, input values or embedded code."""

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.parts = []
        self.excluded = []
        self.in_title = False
        self.title = []
        self.description = None

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "script" and values.get("src", "").split("?")[0] in {
            "/pages/iveco-brand.js", "/pages/narke-brand.js",
        }:
            self.excluded.append("brand-script")
            return
        if tag == "link" and values.get("rel", "").lower() in {
            "icon", "shortcut icon", "apple-touch-icon", "apple-touch-icon-precomposed", "manifest",
        }:
            return
        if tag == "link" and values.get("href") == "/pages/narke-admin.css":
            return
        if tag == "meta":
            name = values.get("name", "").lower()
            prop = values.get("property", "").lower()
            if name in {"theme-color", "application-name", "apple-mobile-web-app-title"} or prop in {
                "og:site_name", "og:type", "og:title", "og:description",
            }:
                return
            if name == "description":
                self.description = brand_text(values.get("content", ""))
                return
        raw = self.get_starttag_text()
        if tag == "html" and values.get("data-platform-theme"):
            # The archived presentation package scopes its obsolete silver
            # theme to this attribute. Switch only its presentation namespace.
            raw = re.sub(r'(\bdata-platform-theme\s*=\s*)(["\'])(.*?)\2',
                         lambda m: m[1] + m[2] + "narke" + m[2], raw, count=1, flags=re.I)
        # Attribute names are deliberately restricted. In particular: no href,
        # value, name, ID, data attributes, contact URLs or storage keys.
        for name, value in attrs:
            if value is None:
                continue
            replacement = None
            if name in {"alt", "title", "aria-label", "placeholder"}:
                replacement = brand_text(value)
            elif tag == "meta" and name == "content" and values.get("name", "").lower() in {
                "description", "twitter:title", "twitter:description",
            }:
                replacement = brand_text(value)
            elif tag == "img" and name == "src":
                replacement = LOGOS.get(value)
            if replacement is not None and replacement != value:
                pattern = rf'(\b{re.escape(name)}\s*=\s*)(["\'])(.*?)\2'
                raw = re.sub(pattern, lambda m: m[1] + m[2] + escape(replacement, quote=True) + m[2],
                             raw, count=1, flags=re.I | re.S)
        self.parts.append(raw)
        if tag in {"script", "style", "noscript", "textarea", "code", "pre"}:
            self.excluded.append(tag)
        if tag == "title":
            self.in_title = True

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == "script" and self.excluded and self.excluded[-1] == "brand-script":
            self.excluded.pop()
            return
        if self.excluded and tag == self.excluded[-1]:
            self.excluded.pop()
        if tag == "title":
            self.in_title = False
        self.parts.append(f"</{tag}>")

    def handle_data(self, data):
        if self.excluded and self.excluded[-1] == "brand-script":
            return
        rendered = data if self.excluded else brand_text(data)
        if self.in_title:
            self.title.append(rendered)
        self.parts.append(rendered)

    def handle_entityref(self, name):
        self.parts.append(f"&{name};")

    def handle_charref(self, name):
        self.parts.append(f"&#{name};")

    def handle_comment(self, data):
        self.parts.append(f"<!--{data}-->")

    def handle_decl(self, decl):
        self.parts.append(f"<!{decl}>")


def with_narke_brand(body, content_type):
    if not content_type.startswith("text/html"):
        return body
    parser = BrandHTML()
    parser.feed(body.decode("utf-8"))
    parser.close()
    html = "".join(parser.parts)
    title = "".join(parser.title).strip()
    if "NARKE" not in title.upper():
        title = (title + " — NARKE").strip(" —")
        html = re.sub(r"<title>.*?</title>", lambda _: "<title>" + escape(title) + "</title>",
                      html, count=1, flags=re.I | re.S)
    description = parser.description or (
        "NARKE Industries : catalogue VIP numérique, espace membre et suivi de vos opérations."
    )
    additions = BRAND_SCRIPT + FAVICON_LINKS + BRAND_META
    additions += ('<meta name="description" content="' + escape(description, quote=True) + '">').encode()
    additions += (
        '<meta property="og:title" content="' + escape(title, quote=True) + '">'
        '<meta property="og:description" content="' + escape(description, quote=True) + '">'
    ).encode()
    if 'id="admin-root"' in html or "data-admin-deposit-form" in html:
        additions += b'<link rel="stylesheet" href="/pages/narke-admin.css">'
    return html.replace("</head>", additions.decode() + "</head>", 1).encode()


# Historical import compatibility, never a second branding policy.
with_iveco_brand = with_narke_brand
