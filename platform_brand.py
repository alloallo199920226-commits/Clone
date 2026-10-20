"""Apply the visible IVECO brand without changing legacy identities or scripts."""

BRAND_SCRIPT = b'<script src="/pages/iveco-brand.js?v=1" defer></script>'
FAVICON_LINKS = (
    b'<link rel="icon" type="image/x-icon" href="/favicon.ico?v=iveco1">'
    b'<link rel="icon" type="image/png" sizes="64x64" href="/pages/assets/iveco-favicon.png?v=1">'
    b'<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=iveco1">'
)


def with_iveco_brand(body, content_type):
    if not content_type.startswith("text/html"):
        return body
    additions = b""
    if b"/pages/iveco-brand.js" not in body:
        additions += BRAND_SCRIPT
    if b"/favicon.ico?v=iveco1" not in body:
        additions += FAVICON_LINKS
    return body.replace(b"</head>", additions + b"</head>", 1)
