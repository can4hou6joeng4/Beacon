import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pdf_expiry_checker.runner import run_audit


class RunnerQualityGateTests(unittest.TestCase):
    def test_fails_job_when_ocr_success_pages_are_too_sparse(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            source_pdf = job_dir / "upload.pdf"
            source_pdf.write_bytes(b"%PDF-1.7 fake")

            def fake_run(command, cwd, text, capture_output):
                output_dir = Path(command[3])
                (output_dir / "manifest.json").write_text(
                    json.dumps(
                        {
                            "pageCount": 2,
                            "outlineCount": 2,
                            "items": [
                                {
                                    "personIndex": 1,
                                    "person": "测试人员",
                                    "bookmark": "身份证",
                                    "startPage": 1,
                                    "endPage": 2,
                                }
                            ],
                            "pages": [1, 2],
                        }
                    ),
                    encoding="utf-8",
                )
                (output_dir / "ocr.txt").write_text(
                    "\n".join(
                        [
                            "PAGE\t1\tERROR\tdomain=Vision code=1",
                            "PAGE\t2\tERROR\tdomain=Vision code=1",
                        ]
                    ),
                    encoding="utf-8",
                )
                return type("Completed", (), {"returncode": 0, "stdout": "", "stderr": ""})()

            with patch("pdf_expiry_checker.runner.subprocess.run", fake_run), self.assertRaises(RuntimeError):
                run_audit(source_pdf, cutoff="2026-06-03", job_dir=job_dir)

            status = json.loads((job_dir / "status.json").read_text(encoding="utf-8"))
            self.assertEqual(status["status"], "failed")
            self.assertIn("OCR 成功页数过少", status["message"])
            self.assertEqual(status["summary"]["ocr_error_pages"], 2)

    def test_fails_job_when_more_than_twenty_percent_of_certificate_pages_fail_ocr(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir)
            source_pdf = job_dir / "upload.pdf"
            source_pdf.write_bytes(b"%PDF-1.7 fake")

            def fake_run(command, cwd, text, capture_output):
                output_dir = Path(command[3])
                (output_dir / "manifest.json").write_text(
                    json.dumps(
                        {
                            "pageCount": 5,
                            "outlineCount": 5,
                            "items": [
                                {
                                    "personIndex": 1,
                                    "person": "测试人员",
                                    "bookmark": "证件",
                                    "startPage": 1,
                                    "endPage": 5,
                                }
                            ],
                            "pages": [1, 2, 3, 4, 5],
                        }
                    ),
                    encoding="utf-8",
                )
                (output_dir / "ocr.txt").write_text(
                    "\n".join(
                        [
                            "PAGE\t1\tLINES\t1",
                            "有效期：2025年01月01日-2026年01月01日",
                            "PAGE_END\t1",
                            "PAGE\t2\tLINES\t1",
                            "有效期：2025年01月01日-2026年01月01日",
                            "PAGE_END\t2",
                            "PAGE\t3\tLINES\t1",
                            "有效期：2025年01月01日-2026年01月01日",
                            "PAGE_END\t3",
                            "PAGE\t4\tERROR\tdomain=Vision code=1",
                            "PAGE\t5\tERROR\tdomain=Vision code=1",
                        ]
                    ),
                    encoding="utf-8",
                )
                return type("Completed", (), {"returncode": 0, "stdout": "", "stderr": ""})()

            with patch("pdf_expiry_checker.runner.subprocess.run", fake_run), self.assertRaises(RuntimeError):
                run_audit(source_pdf, cutoff="2026-06-03", job_dir=job_dir)

            status = json.loads((job_dir / "status.json").read_text(encoding="utf-8"))
            self.assertEqual(status["summary"]["pages_ocr"], 3)
            self.assertEqual(status["summary"]["ocr_error_pages"], 2)

    def tearDown(self):
        shutil.rmtree("__pycache__", ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
