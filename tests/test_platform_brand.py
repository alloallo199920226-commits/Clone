"""Branding must not change sessions, financial data or imported JavaScript."""
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest
from zipfile import ZipFile

import admin_assets
from platform_brand import BRAND_SCRIPT, FAVICON_LINKS, with_iveco_brand
from server import MORE_PAGES, PAGES

ROOT = Path(__file__).resolve().parents[1]


class VisibleCopy(HTMLParser):
    def __init__(self):
        super().__init__()
        self.excluded = 0
        self.text = []

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.excluded += 1
        if not self.excluded:
            self.text.extend(value for key, value in attrs
                             if value and key in {"alt", "aria-label", "title", "placeholder"})

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.excluded = max(0, self.excluded - 1)

    def handle_data(self, data):
        if not self.excluded:
            self.text.append(data)


class PlatformBrandTests(unittest.TestCase):
    def test_all_served_templates_have_only_narke_branding(self):
        files = {ROOT / folder / "code.html" for folder in PAGES.values()}
        files.update(ROOT / "pages" / filename for filename in MORE_PAGES.values())
        for filename in files:
            with self.subTest(file=filename.relative_to(ROOT)):
                parser = VisibleCopy()
                parser.feed(with_iveco_brand(filename.read_bytes(), "text/html").decode())
                self.assertIsNone(re.search(r"\b(?:IVECO|SHINERAY|SWM|Sprite|AERONOVA|Valhalla)\b",
                                            " ".join(parser.text), re.I))

    def test_adapter_injection_is_once_and_does_not_rewrite_identifiers(self):
        original = b'<html><head></head><body data-id="shineray_users">IVECO</body></html>'
        branded = with_iveco_brand(original, "text/html; charset=utf-8")
        self.assertEqual(branded.count(BRAND_SCRIPT), 1)
        self.assertEqual(with_iveco_brand(branded, "text/html"), branded)
        self.assertIn(b'data-id="shineray_users"', branded)
        self.assertIn(b">NARKE</body>", branded)
        self.assertIn(b'NARKE Industries', branded)
        self.assertNotIn(b'iveco1', branded)

    def test_favicon_on_all_html_even_with_existing_brand_script(self):
        original = b"<html><head>" + BRAND_SCRIPT + b"</head><body></body></html>"
        branded = with_iveco_brand(original, "text/html")
        self.assertEqual(branded.count(FAVICON_LINKS), 1)
        self.assertEqual(branded.count(BRAND_SCRIPT), 1)
        self.assertEqual(with_iveco_brand(branded, "text/html"), branded)

    def test_non_html_bytes_remain_unchanged(self):
        for content_type in ["text/javascript", "application/json", "image/png", "text/css"]:
            self.assertEqual(with_iveco_brand(b"SHINERAY </head>", content_type), b"SHINERAY </head>")

    def test_code_contacts_and_form_values_are_not_rewritten(self):
        original = b'''<html><head><title>IVECO</title></head><body>
<script>const key="IVECO"; const html="<p>Sprite</p>";</script>
<style>.IVECO{color:red}</style><input value="IVECO" name="shineray" placeholder="IVECO">
<a href="https://t.me/Ivecoservice">@Ivecoservice</a><code>IVECO</code>
<p>IVECO SHINERAY Sprite</p></body></html>'''
        branded = with_iveco_brand(original, "text/html")
        for fragment in [b'const key="IVECO"', b'.IVECO{color:red}', b'value="IVECO"',
                         b'name="shineray"', b'https://t.me/Ivecoservice', b'<code>IVECO</code>']:
            self.assertIn(fragment, branded)
        self.assertIn(b'placeholder="NARKE"', branded)
        self.assertIn(b'<p>NARKE NARKE NARKE</p>', branded)

    def test_metadata_is_narke_and_idempotent_for_admin(self):
        original = b'''<html data-platform-theme="silver"><head><title>Admin IVECO</title>
<meta name="theme-color" content="red"><link rel="icon" href="/old.ico">
</head><body><main id="admin-root"></main></body></html>'''
        branded = with_iveco_brand(original, "text/html")
        self.assertEqual(with_iveco_brand(branded, "text/html"), branded)
        self.assertIn(b'content="#00131e"', branded)
        self.assertIn(b'data-platform-theme="narke"', branded)
        self.assertNotIn(b'/old.ico', branded)
        self.assertEqual(branded.count(b'rel="manifest"'), 1)

    def test_original_admin_scripts_still_match_the_archive(self):
        with ZipFile(admin_assets.ARCHIVE) as bundle:
            for route, filename in admin_assets.ADMIN_SCRIPTS.items():
                body, content_type = admin_assets.browser_asset("/admin-ui/" + route)
                expected = bundle.read(admin_assets.PREFIX + "administration/" + filename)
                self.assertEqual(with_iveco_brand(body, content_type), expected)

    def test_unrelated_company_history_is_not_attributed_to_iveco(self):
        for filename in ["a-propos.html", "regles.html"]:
            body = (ROOT / "pages" / filename).read_text()
            self.assertNotIn("600615", body)
            self.assertNotIn("Fondée en 1997", body)


if __name__ == "__main__":
    unittest.main()
