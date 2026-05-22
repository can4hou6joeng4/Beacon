# Next.js Audit Command Center Design

## Goal

Build a richer browser-based audit command center for the PDF certificate expiry checker while preserving the existing macOS PDFKit/Vision OCR pipeline. The first implementation phase should replace the current static workbench with a Next.js + TypeScript UI that provides visible job progress, historical job browsing, result charts, and evidence-focused result tables.

## Confirmed Direction

The selected direction is **A: 审计指挥台**.

The UI should feel like an operational tool for repeated audit work, not a marketing page or wizard. The first screen should be the actual workbench:

- Upload a PDF and choose a cutoff date.
- Show a live, stage-based progress model.
- Present the current audit conclusion first.
- Show summary metrics and a compact result distribution chart.
- Let the user drill into findings through tabs and result rows.
- Keep historical jobs visible so a prior report can be reopened or downloaded.

## Current System Boundary

The existing backend path is proven and should remain stable:

- Python standard-library HTTP server receives uploads and exposes job APIs.
- Swift helper uses macOS `PDFKit`, `Vision`, and `AppKit` for outline extraction and OCR.
- Python extractor parses `ocr.txt` and writes `result.json`, `matches.csv`, and `status.json`.

The Next.js migration should not rewrite OCR, PDF rendering, or expiry extraction. It should wrap and extend the existing local pipeline.

## Target Tech Stack

- Framework: Next.js App Router + TypeScript
- Runtime UI: React client components where interaction is needed
- Database: SQLite through `better-sqlite3`
- UI Components: shadcn/ui
- Charts: Recharts
- Existing backend: Python + Swift OCR retained

## Architecture

Use Next.js as the browser-facing application and lightweight API facade. Keep the Python OCR service as the worker backend.

Recommended local topology:

- Next.js dev server listens on a new port, for example `127.0.0.1:3000`.
- Python OCR service keeps listening on `127.0.0.1:8787`.
- Next.js route handlers proxy upload, status, result, and download requests to the Python service.
- Next.js stores durable job metadata in SQLite for history and dashboard queries.

This keeps the risky OCR path unchanged while allowing a much richer UI and persistent history.

## Data Flow

1. User uploads a PDF in the Next.js workbench.
2. Next.js creates or records a SQLite job row with filename, cutoff date, status, timestamps, and source path metadata.
3. Next.js sends the file to the existing Python `/api/jobs` endpoint.
4. Python creates the job directory and starts OCR processing.
5. Next.js stores the returned Python `job_id`.
6. Client polls a Next.js status endpoint.
7. Next.js fetches status/result from Python and updates SQLite summary fields.
8. UI renders progress, metrics, charts, tables, and history from the combined current job plus SQLite state.

## Progress Model

The first phase should show a five-stage progress tracker:

1. 上传完成
2. 解析书签
3. OCR 识别
4. 抽取有效期
5. 生成报告

The current Python status payload only exposes coarse states (`queued`, `running`, `complete`, `failed`). The first implementation can map these states conservatively:

- `queued`: stage 1 active
- `running`: stages 2-4 active with indeterminate OCR animation
- `complete`: all stages complete
- `failed`: current stage marked failed

If page-level OCR progress is not available, the UI should not fake exact page counts. It can show "OCR 正在处理" with an indeterminate progress bar. Page-level progress can be added later by extending the Swift/Python status writer.

## History Model

SQLite should provide a real history panel.

Minimum `jobs` fields:

- `id`: local UUID
- `python_job_id`: existing 32-character Python job id
- `filename`
- `cutoff`
- `status`
- `message`
- `created_at`
- `updated_at`
- `completed_at`
- `pages_ocr`
- `certificate_pages`
- `validity_candidates`
- `matches`
- `near_expiry`
- `needs_review`

The UI history panel should support:

- Current job highlighted.
- Recent jobs listed newest first.
- Reopen a prior result.
- Download CSV, JSON, OCR from a prior job.
- Search by filename or job id is not required for first phase; the first phase should list recent jobs newest first and support reopening them.

## Result UI

The current result categories should remain:

- 早于截止日期
- 临近到期
- 需要复核
- 全部候选

Each result row should show:

- Page number
- Person / certificate label
- Expiry date or review reason
- Evidence snippet
- A "查看" or "复核" action

The first phase can use a shadcn `Sheet` or `Drawer` for row details. It should include raw context, parsed field context, mapped bookmark/person metadata, and download links. Full PDF image highlighting is out of scope for the first phase because the current OCR output does not contain text coordinates.

## Chart UI

Use Recharts for a compact result distribution chart:

- matches
- near_expiry
- needs_review
- valid candidates not flagged

The chart should support the "结论先行、下钻证据" workflow: it summarizes risk but does not replace the evidence table.

## Visual Style

The UI should feel like a quiet audit console:

- Dense but readable layout.
- Sidebar upload/progress area.
- Central current job workspace.
- Right-side history panel on desktop.
- Responsive collapse on narrow screens.
- Use shadcn cards only for repeated items and framed tools.
- Avoid decorative landing-page treatment.
- Keep colors restrained: neutral background, teal/blue-green action accents, clear warning/danger badges.

## API Compatibility

The existing Python endpoints should continue to work:

- `POST /api/jobs`
- `GET /api/jobs/{job_id}/status`
- `GET /api/jobs/{job_id}/result`
- `GET /api/jobs/{job_id}/matches.csv`
- `GET /api/jobs/{job_id}/result.json`
- `GET /api/jobs/{job_id}/ocr.txt`
- `GET /api/jobs/{job_id}/manifest.json`

Next.js can proxy these endpoints or expose a namespaced API such as `/api/audit/jobs`. The first phase should keep Python directly responsible for OCR artifacts and downloads.

## Error Handling

The UI should handle:

- Python service unavailable.
- Upload failure.
- OCR failure returned in status.
- Missing result after completion.
- Invalid or stale history item whose Python artifact is missing.

For failures, show a clear alert with the failed stage and the backend message. Avoid hiding errors behind a generic "上传失败".

## Testing

Test coverage should include:

- Existing Python unit tests remain passing.
- SQLite repository tests for create/update/list job history.
- Next.js route handler tests where feasible for status/result normalization.
- Component-level tests can be deferred if the project does not already have a React test stack, but the UI should be manually verified through the browser.

## First Phase Scope

Implement:

- Next.js + TypeScript scaffold.
- shadcn/ui setup and base theme.
- SQLite job history repository.
- Upload form wired through Next.js to Python.
- Status polling and stage progress UI.
- Current result metrics, Recharts distribution chart, result tabs, result table.
- History side panel with reopen/download.
- README update with dual-service startup instructions.

Defer:

- PDF image preview and coordinate highlighting.
- Human review notes and status workflow.
- Multi-user authentication.
- Fixed Cloudflare domain and launchd/service automation.
- Rewriting the Python OCR pipeline.

## Acceptance Criteria

- A user can open the Next.js workbench and run the same `投标文件.pdf` audit.
- The result no longer shows the previously fixed false matches.
- The UI shows progress stages during processing.
- Completed jobs appear in the history panel.
- Reopening a historical job renders metrics, chart, and result table without re-uploading.
- CSV, JSON, and OCR downloads still work.
- Existing Python tests pass.
- The old static page can remain temporarily, but the documented recommended UI is the Next.js workbench.
