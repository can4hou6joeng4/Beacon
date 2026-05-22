import unittest

from pdf_expiry_checker.server import is_authorized, parse_multipart_form


class MultipartParsingTests(unittest.TestCase):
    def test_parses_pdf_file_and_cutoff_field(self):
        boundary = "----local-boundary"
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="cutoff"\r\n\r\n'
            "2026-05-22\r\n"
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="pdf"; filename="sample.pdf"\r\n'
            "Content-Type: application/pdf\r\n\r\n"
        ).encode() + b"%PDF-1.7 fake" + f"\r\n--{boundary}--\r\n".encode()
        fields, files = parse_multipart_form(f"multipart/form-data; boundary={boundary}", body)
        self.assertEqual(fields["cutoff"], "2026-05-22")
        self.assertEqual(files["pdf"]["filename"], "sample.pdf")
        self.assertEqual(files["pdf"]["content"], b"%PDF-1.7 fake")

    def test_authorizes_query_or_header_token(self):
        self.assertTrue(is_authorized("/path?token=secret", {}, "secret"))
        self.assertTrue(is_authorized("/path", {"X-Access-Token": "secret"}, "secret"))
        self.assertFalse(is_authorized("/path?token=wrong", {}, "secret"))
        self.assertTrue(is_authorized("/path", {}, ""))

    def test_static_assets_do_not_require_token(self):
        self.assertTrue(is_authorized("/static/styles.css", {}, "secret"))


if __name__ == "__main__":
    unittest.main()
