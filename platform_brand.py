"""Apply the visible IVECO brand without changing legacy identities or scripts."""

BRAND_SCRIPT = b'<script src="/pages/iveco-brand.js?v=1" defer></script>'


def with_iveco_brand(body, content_type):
    if not content_type.startswith("text/html") or b"/pages/iveco-brand.js" in body:
        return body
    return body.replace(b"</head>", BRAND_SCRIPT + b"</head>", 1)
