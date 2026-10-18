import unittest
import admin_assets
from server import MORE_PAGES, PAGES, ROOT, with_form_controls


class SharedFormControlsTests(unittest.TestCase):
    def test_all_html_pages_receive_late_stylesheet(self):
        files = {ROOT / folder / "code.html" for folder in PAGES.values()}
        files.update(ROOT / "pages" / page for page in MORE_PAGES.values())
        for file in files:
            with self.subTest(page=str(file)):
                body = with_form_controls(file.read_bytes(), "text/html; charset=utf-8")
                self.assertIn(b'/pages/form-controls.css?v=1"></head>', body)
                self.assertNotIn(b"user-scalable=no", body)
                self.assertNotIn(b"maximum-scale=1", body)
        body, media_type = admin_assets.browser_asset(admin_assets.ADMIN_ROUTE)
        self.assertIn(b'/pages/form-controls.css?v=1"></head>', with_form_controls(body, media_type))

    def test_non_html_assets_are_unchanged(self):
        body = b"const content = '</head>';"
        self.assertEqual(with_form_controls(body, "text/javascript"), body)


if __name__ == "__main__":
    unittest.main()
