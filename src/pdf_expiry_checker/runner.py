from __future__ import annotations

import json
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Any

from .extractor import analyze_ocr_pages, parse_ocr_text, result_to_csv, write_json


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SWIFT_SCRIPT = PROJECT_ROOT / "swift" / "pdf_audit.swift"
JOBS_DIR = PROJECT_ROOT / "jobs"


def _page_items(manifest: dict[str, Any]) -> dict[int, list[dict[str, Any]]]:
    mapping: dict[int, list[dict[str, Any]]] = {}
    for item in manifest.get("items", []):
        normalized = {
            "person_index": item.get("personIndex"),
            "person": item.get("person"),
            "bookmark": item.get("bookmark"),
            "start_page": item.get("startPage"),
            "end_page": item.get("endPage"),
        }
        for page in range(int(item.get("startPage", 0)), int(item.get("endPage", 0)) + 1):
            mapping.setdefault(page, []).append(normalized)
    return mapping


def create_job_dir() -> Path:
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    job_dir = JOBS_DIR / uuid.uuid4().hex
    job_dir.mkdir()
    return job_dir


def write_status(job_dir: Path, status: str, message: str, **extra: Any) -> None:
    payload = {"status": status, "message": message, **extra}
    write_json(job_dir / "status.json", payload)


def _assert_ocr_quality(result: dict[str, Any], manifest: dict[str, Any], pages: Any, job_dir: Path) -> None:
    summary = result["summary"]
    certificate_pages = len(manifest.get("pages", []))
    success_pages = summary.get("pages_ocr", 0)
    error_pages = summary.get("ocr_error_pages", 0)
    result["ocr_errors"] = [
        {"page": page, "error": error}
        for page, error in sorted(getattr(pages, "error_pages", {}).items())
    ]
    if certificate_pages > 0 and error_pages > 0 and (success_pages == 0 or error_pages / certificate_pages > 0.2):
        message = f"OCR 成功页数过少：{success_pages}/{certificate_pages} 页成功，{error_pages} 页失败"
        write_json(job_dir / "result.json", result)
        write_status(job_dir, "failed", message, summary=summary)
        raise RuntimeError(message)


def run_audit(pdf_path: Path, cutoff: str, job_dir: Path | None = None) -> dict[str, Any]:
    job_dir = job_dir or create_job_dir()
    input_pdf = job_dir / "input.pdf"
    if pdf_path.resolve() != input_pdf.resolve():
        shutil.move(str(pdf_path), str(input_pdf))

    write_status(job_dir, "running", "正在解析 PDF 书签并执行 OCR")
    command = ["swift", str(SWIFT_SCRIPT), str(input_pdf), str(job_dir), "2.0"]
    completed = subprocess.run(command, cwd=PROJECT_ROOT, text=True, capture_output=True)
    if completed.returncode != 0:
        write_status(job_dir, "failed", "OCR 处理失败", stderr=completed.stderr)
        raise RuntimeError(completed.stderr or completed.stdout or "swift OCR failed")

    manifest = json.loads((job_dir / "manifest.json").read_text(encoding="utf-8"))
    pages = parse_ocr_text((job_dir / "ocr.txt").read_text(encoding="utf-8", errors="replace"))
    result = analyze_ocr_pages(pages, cutoff=cutoff, page_items=_page_items(manifest))
    _assert_ocr_quality(result, manifest, pages, job_dir)
    result["manifest"] = {
        "page_count": manifest.get("pageCount", 0),
        "outline_count": manifest.get("outlineCount", 0),
        "certificate_items": len(manifest.get("items", [])),
        "certificate_pages": len(manifest.get("pages", [])),
    }
    result["job_id"] = job_dir.name
    write_json(job_dir / "result.json", result)
    (job_dir / "matches.csv").write_text(result_to_csv(result["matches"]), encoding="utf-8")
    write_status(job_dir, "complete", "检查完成", summary=result["summary"])
    return result
