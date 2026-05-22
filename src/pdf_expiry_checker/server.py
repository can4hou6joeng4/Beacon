from __future__ import annotations

from email.parser import BytesParser
from email.policy import default
import json
import mimetypes
import os
import secrets
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from .runner import JOBS_DIR, create_job_dir, run_audit, write_status


PROJECT_ROOT = Path(__file__).resolve().parents[2]
STATIC_DIR = PROJECT_ROOT / "static"
ACCESS_TOKEN = os.environ.get("PDF_CHECKER_TOKEN", "")


def _json(handler: BaseHTTPRequestHandler, payload: dict, status: int = 200) -> None:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def is_authorized(path: str, headers: dict, token: str | None = None) -> bool:
    expected = ACCESS_TOKEN if token is None else token
    parsed = urlparse(path)
    if parsed.path.startswith("/static/"):
        return True
    if not expected:
        return True
    supplied = parse_qs(parsed.query).get("token", [""])[0] or headers.get("X-Access-Token", "")
    return secrets.compare_digest(supplied, expected)


def _safe_job_path(job_id: str) -> Path | None:
    if not job_id or any(ch not in "0123456789abcdef" for ch in job_id) or len(job_id) != 32:
        return None
    path = JOBS_DIR / job_id
    return path if path.exists() else None


def parse_multipart_form(content_type: str, body: bytes) -> tuple[dict[str, str], dict[str, dict]]:
    message_bytes = (
        f"Content-Type: {content_type}\r\n"
        "MIME-Version: 1.0\r\n\r\n"
    ).encode("utf-8") + body
    message = BytesParser(policy=default).parsebytes(message_bytes)
    fields: dict[str, str] = {}
    files: dict[str, dict] = {}
    if not message.is_multipart():
        return fields, files
    for part in message.iter_parts():
        disposition = part.get_content_disposition()
        if disposition != "form-data":
            continue
        name = part.get_param("name", header="content-disposition")
        filename = part.get_filename()
        payload = part.get_payload(decode=True) or b""
        if not name:
            continue
        if filename:
            files[name] = {"filename": filename, "content": payload, "content_type": part.get_content_type()}
        else:
            fields[name] = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
    return fields, files


class Handler(BaseHTTPRequestHandler):
    server_version = "PDFExpiryChecker/0.1"

    def log_message(self, format: str, *args) -> None:
        print("[%s] %s" % (self.log_date_time_string(), format % args))

    def do_GET(self) -> None:
        if not is_authorized(self.path, self.headers):
            _json(self, {"error": "未授权，请使用带 token 的链接访问"}, 401)
            return
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self._serve_static("index.html")
        elif parsed.path.startswith("/static/"):
            self._serve_static(parsed.path.removeprefix("/static/"))
        elif parsed.path.startswith("/api/jobs/"):
            self._serve_job(parsed.path)
        else:
            self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        if not is_authorized(self.path, self.headers):
            _json(self, {"error": "未授权，请使用带 token 的链接访问"}, 401)
            return
        if urlparse(self.path).path != "/api/jobs":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        fields, files = parse_multipart_form(self.headers.get("Content-Type", ""), body)
        cutoff = fields.get("cutoff", "2026-05-22")
        file_item = files.get("pdf")
        if file_item is None or not file_item.get("filename"):
            _json(self, {"error": "请上传 PDF 文件"}, 400)
            return
        job_dir = create_job_dir()
        upload_path = job_dir / "upload.pdf"
        upload_path.write_bytes(file_item["content"])
        write_status(job_dir, "queued", "任务已创建，等待处理")

        def worker() -> None:
            try:
                run_audit(upload_path, cutoff=cutoff, job_dir=job_dir)
            except Exception as exc:
                write_status(job_dir, "failed", str(exc))

        threading.Thread(target=worker, daemon=True).start()
        _json(self, {"job_id": job_dir.name})

    def _serve_static(self, relative: str) -> None:
        path = (STATIC_DIR / relative).resolve()
        if not str(path).startswith(str(STATIC_DIR.resolve())) or not path.exists() or not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(path.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _serve_job(self, path: str) -> None:
        parts = path.strip("/").split("/")
        if len(parts) < 3:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        job_dir = _safe_job_path(parts[2])
        if job_dir is None:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        resource = parts[3] if len(parts) >= 4 else "status"
        if resource == "status":
            status_path = job_dir / "status.json"
            payload = json.loads(status_path.read_text(encoding="utf-8")) if status_path.exists() else {"status": "unknown"}
            _json(self, payload)
        elif resource == "result":
            result_path = job_dir / "result.json"
            if not result_path.exists():
                _json(self, {"error": "结果尚未生成"}, 404)
                return
            _json(self, json.loads(result_path.read_text(encoding="utf-8")))
        elif resource in {"matches.csv", "result.json", "ocr.txt", "manifest.json"}:
            file_path = job_dir / resource
            if not file_path.exists():
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            data = file_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(file_path.name)[0] or "application/octet-stream")
            self.send_header("Content-Disposition", f"attachment; filename={file_path.name}")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            self.send_error(HTTPStatus.NOT_FOUND)


def run(host: str = "127.0.0.1", port: int = 8787) -> None:
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"PDF expiry checker running at http://{host}:{port}")
    if ACCESS_TOKEN:
        print(f"Access URL: http://{host}:{port}/?token={ACCESS_TOKEN}")
    server.serve_forever()
