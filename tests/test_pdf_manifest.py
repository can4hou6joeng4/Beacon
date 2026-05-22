import json
import platform
import subprocess
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SWIFT_SCRIPT = PROJECT_ROOT / "swift" / "pdf_audit.swift"
SAMPLE_PDF = Path("/Users/a1-6/Downloads/投标文件.pdf")
VISION_FAILURE_SAMPLE_PDF = Path("/Users/a1-6/Downloads/6.3.pdf")


@unittest.skipUnless(platform.system() == "Darwin", "PDFKit manifest extraction requires macOS")
class PdfManifestTests(unittest.TestCase):
    def test_extracts_certificate_pages_when_people_are_nested_under_section(self):
        if not SAMPLE_PDF.exists():
            self.skipTest(f"sample PDF not found: {SAMPLE_PDF}")

        with tempfile.TemporaryDirectory() as temp_dir:
            completed = subprocess.run(
                ["swift", str(SWIFT_SCRIPT), str(SAMPLE_PDF), temp_dir, "1.0"],
                cwd=PROJECT_ROOT,
                env={"PDF_AUDIT_MANIFEST_ONLY": "1"},
                text=True,
                capture_output=True,
                check=True,
            )

            manifest = json.loads((Path(temp_dir) / "manifest.json").read_text(encoding="utf-8"))
            self.assertIn("manifest_pages=", completed.stdout)
            self.assertGreater(manifest["outlineCount"], 0)
            self.assertGreater(len(manifest["items"]), 0)
            self.assertGreater(len(manifest["pages"]), 0)
            self.assertEqual(manifest["items"][0]["person"], "廖永坚")
            self.assertEqual(manifest["items"][0]["bookmark"], "一级注册造价师证（交通）")

    def test_tesseract_fallback_reads_validity_text_when_vision_is_skipped(self):
        if not VISION_FAILURE_SAMPLE_PDF.exists():
            self.skipTest(f"sample PDF not found: {VISION_FAILURE_SAMPLE_PDF}")
        if subprocess.run(["which", "tesseract"], text=True, capture_output=True).returncode != 0:
            self.skipTest("tesseract not installed")

        with tempfile.TemporaryDirectory() as temp_dir:
            completed = subprocess.run(
                ["swift", str(SWIFT_SCRIPT), str(VISION_FAILURE_SAMPLE_PDF), temp_dir, "3.0"],
                cwd=PROJECT_ROOT,
                env={"PDF_AUDIT_MAX_PAGES": "1", "PDF_AUDIT_SKIP_VISION": "1"},
                text=True,
                capture_output=True,
                check=True,
            )

            ocr_text = (Path(temp_dir) / "ocr.txt").read_text(encoding="utf-8")
            self.assertIn("manifest_pages=", completed.stdout)
            self.assertIn("SOURCE\ttesseract", ocr_text)
            self.assertIn("有 效 期", ocr_text)
            self.assertIn("2029", ocr_text)


if __name__ == "__main__":
    unittest.main()
