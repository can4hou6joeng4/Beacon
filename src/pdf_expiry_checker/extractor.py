from __future__ import annotations

import csv
import io
import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any


DATE_CN = re.compile(r"(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?")
DATE_DOT = re.compile(r"(20\d{2})\s*[.。:\-]\s*(\d{1,2})\s*[.。:\-]\s*(\d{1,2})")
DATE_COMPACT_TAIL = re.compile(r"(20\d{2})\s*[.。:\-]\s*(\d{2})(\d{2})(?!\d)")
DATE_COMPACT = re.compile(r"(20\d{2})(\d{2})(\d{2})(?!\d)")
VALIDITY_MARKER = re.compile(
    r"有\s*(?:效|[A-Za-z]{1,3}|贿|B)\s*(?:期|限|FA)"
    r"|有\s*效\s*贿\s*限"
    r"|有\s*效\s*期\s*限"
    r"|注册\s*有\s*效\s*期"
    r"|有\s*效\s*期\s*至"
    r"|效\s*期"
    r"|效\s*期\s*限"
    r"|有效期報"
    r"|有效期燉"
)
DOCUMENT_USE_VALIDITY_MARKER = re.compile(r"(?:使用|用|吏用|史用|更用)\s*有\s*效\s*期")
NOISE_MARKER = re.compile(r"证明日期|发证日期|签名日期|出生|通过时间|毕业|条形码|二维码|核查|查验")
PRIMARY_COST_CERTIFICATE_MARKER = re.compile(r"一级\s*(?:注册)?\s*造价\s*(?:工程师)?\s*注册?\s*证")


class OCRPages(dict[int, list[str]]):
    def __init__(self, pages: dict[int, list[str]], error_pages: dict[int, str] | None = None):
        super().__init__(pages)
        self.pages = pages
        self.error_pages = error_pages or {}


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def _safe_date(year: str, month: str, day: str) -> date | None:
    try:
        return date(int(year), int(month), int(day))
    except ValueError:
        return None


def find_dates(text: str) -> list[date]:
    normalized = re.sub(r"(20\d{2}\s*[.。:\-]\s*\d{1,2})\s+(\d{1,2})(?!\d)", r"\1.\2", text)
    found: list[tuple[int, int, date]] = []
    for regex in (DATE_CN, DATE_DOT, DATE_COMPACT_TAIL, DATE_COMPACT):
        for match in regex.finditer(normalized):
            dt = _safe_date(*match.groups())
            if dt is None:
                continue
            if any(not (match.end() <= start or match.start() >= end) for start, end, _ in found):
                continue
            found.append((match.start(), match.end(), dt))
    found.sort(key=lambda item: item[0])
    return [item[2] for item in found]


def validity_segment(context: str) -> str:
    marker = VALIDITY_MARKER.search(context)
    if not marker:
        return context
    segment = context[marker.start():]
    stop_patterns = [
        r"\s中华人民共和国",
        r"\s一级\s*造价\s*工程师\s*注册\s*证书",
        r"\s证\s*书\s*编\s*号",
        r"\s20\d{2}[-年]\d{1,2}[-月]\d{1,2}\s*-\s*(?:初始注册|延续注册|机构外变更|变更注册)",
        r"\s(?:初始注册|延续注册|机构外变更|变更注册)",
        r"\s批准日期",
        r"\s签名日期",
        r"\s发证日期",
        r"\s证明日期",
        r"\s20\d{2}[.\-年]\d{1,2}[.\-月]\d{1,2}日?\s*-\s*(?:初始注册|延续注册|续注册|紅续注册|机构内变更|机构外变更|变更注册)",
    ]
    cut = len(segment)
    for pattern in stop_patterns:
        stop = re.search(pattern, segment)
        if stop:
            cut = min(cut, stop.start())
    return segment[:cut]


def extract_expiry_from_context(context: str) -> str | None:
    segment = validity_segment(context)
    if "长期" in segment.replace(" ", ""):
        return "长期"
    dates = find_dates(segment)
    if not dates:
        return None
    return dates[-1].isoformat()


def parse_ocr_text(text: str) -> OCRPages:
    pages: dict[int, list[str]] = {}
    error_pages: dict[int, str] = {}
    current_page: int | None = None
    for line in text.splitlines():
        page_match = re.match(r"PAGE\t(\d+)\tLINES\t\d+", line)
        if page_match:
            current_page = int(page_match.group(1))
            pages[current_page] = []
            continue
        error_match = re.match(r"PAGE\t(\d+)\tERROR\t(.+)", line)
        if error_match:
            error_pages[int(error_match.group(1))] = error_match.group(2)
            current_page = None
            continue
        if line.startswith("PAGE_END\t"):
            current_page = None
            continue
        if current_page is not None:
            pages[current_page].append(line)
    return OCRPages(pages, error_pages)


def analyze_ocr_pages(
    pages: dict[int, list[str]],
    cutoff: str,
    near_days: int = 45,
    page_items: dict[int, list[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    cutoff_date = parse_date(cutoff)
    near_until = cutoff_date + timedelta(days=near_days)
    page_items = page_items or {}
    candidates: list[dict[str, Any]] = []
    review: list[dict[str, Any]] = []

    for page, lines in sorted(pages.items()):
        title = next((line.strip() for line in lines if line.strip()), "")
        page_text = " ".join(lines)
        should_review_missing_use_validity = (
            PRIMARY_COST_CERTIFICATE_MARKER.search(page_text) is not None
            and DOCUMENT_USE_VALIDITY_MARKER.search(page_text) is None
        )
        for index, line in enumerate(lines):
            if not VALIDITY_MARKER.search(line):
                continue
            if DOCUMENT_USE_VALIDITY_MARKER.search(line):
                context_lines = lines[index: min(len(lines), index + 4)]
            else:
                context_lines = lines[max(0, index - 1): min(len(lines), index + 6)]
            context = " ".join(context_lines)
            if NOISE_MARKER.search(context) and not VALIDITY_MARKER.search(context):
                continue
            if re.search(r"条形码|二维码|查验部门|核查网页|本条形码", context):
                continue
            field_context = validity_segment(context)
            expiry = extract_expiry_from_context(context)
            row = {
                "page": page,
                "title": title,
                "context": context,
                "field_context": field_context,
                "expiry_date": expiry,
                "items": page_items.get(page, []),
            }
            if expiry is None:
                row["reason"] = "有效期字段存在但日期无法可靠解析"
                review.append(row)
            else:
                candidates.append(row)

        if should_review_missing_use_validity:
            review.append(
                {
                    "page": page,
                    "title": title,
                    "context": page_text,
                    "field_context": "一级注册造价师证页未识别到使用有效期",
                    "expiry_date": None,
                    "items": page_items.get(page, []),
                    "reason": "一级注册造价师证应以使用有效期为准，但 OCR 未识别到该字段",
                }
            )

    matches = []
    near_expiry = []
    for row in candidates:
        expiry = row["expiry_date"]
        if expiry == "长期":
            continue
        expiry_date = parse_date(expiry)
        if expiry_date < cutoff_date:
            matches.append(row)
        elif cutoff_date <= expiry_date <= near_until:
            near_expiry.append(row)

    summary = {
        "pages_ocr": len(pages),
        "ocr_error_pages": len(getattr(pages, "error_pages", {})),
        "ocr_total_pages": len(pages) + len(getattr(pages, "error_pages", {})),
        "validity_candidates": len(candidates) + len(review),
        "matches": len(matches),
        "near_expiry": len(near_expiry),
        "needs_review": len(review),
        "cutoff": cutoff,
    }
    return {"summary": summary, "matches": matches, "near_expiry": near_expiry, "needs_review": review, "candidates": candidates}


def result_to_csv(rows: list[dict[str, Any]]) -> str:
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["page", "title", "expiry_date", "context"])
    writer.writeheader()
    for row in rows:
        writer.writerow({key: row.get(key, "") for key in writer.fieldnames})
    return output.getvalue()


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
