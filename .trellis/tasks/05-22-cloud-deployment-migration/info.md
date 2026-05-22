# Technical Design: Cloud Deployment Migration

## Recommended target architecture

```text
Browser
  |
  v
pdf-audit.bobochang.cn
  |
  v
Cloudflare Worker / OpenNext app
  |        |          |
  |        |          +--> Cloud DB: job history/status
  |        +-------------> R2/S3/GCS: PDFs and generated artifacts
  |
  +----------------------> Async OCR adapter
                             |
                             +--> PaddleOCR API (PaddleOCR-VL-1.5)
                             +--> fallback: AWS Textract or Google Vision
                             +--> fallback: Linux OCR container
                             +--> fallback: managed provider OCR
```

## Current implementation target

The production business runtime is Cloudflare-only. Do not restart or depend on
the old local LaunchAgents, local Next.js/Python services, or Cloudflare Tunnel
for production traffic.

The migration is implemented by wiring these boundaries:

- publish the architecture and migration runbook,
- name the required environment variables and secrets,
- document the PaddleOCR job submission, polling, and JSONL result contract,
- define storage/database/provider contracts,
- keep local code only as a legacy development/test reference,
- deploy the OpenNext Worker and bind the production hostname.

## Key design decisions

- Cloudflare remains the DNS and public access layer because the domain is already managed there and Cloudflare can host the frontend/API or route to another origin.
- The local Tunnel is retired as a production route. Rollback should use Worker deployment rollback or alternate cloud OCR/provider configuration, not the local Mac.
- R2 is the natural Cloudflare-native file store for PDFs and artifacts; S3/GCS may be used if the OCR provider requires same-cloud storage.
- Job processing must be asynchronous because large PDFs and OCR jobs are too slow and memory-heavy for request/response handlers.
- PaddleOCR is the first OCR provider target because the user supplied a concrete async job API and model name.
- PaddleOCR tokens must be configured through secrets, never committed to repository documentation or examples.
- Existing artifact names should be preserved: `result.json`, `matches.csv`, `ocr.txt`, `manifest.json`.
- Cloudflare production resources are:
  - Worker: `pdf-certificate-expiry-checker`
  - Hostname: `pdf-audit.bobochang.cn`
  - D1 database: `pdf-audit-db`
  - R2 artifacts bucket: `pdf-audit-artifacts`
  - R2 OpenNext cache bucket: `pdf-audit-opennext-cache`

## Main risk

OCR parity is the riskiest part. The Swift/Vision pipeline currently combines PDF outline parsing, page rendering, OCR, fallback OCR, and domain-specific date extraction. PaddleOCR can replace text extraction, but outline/person-page mapping and result normalization still need repo-specific logic.

## PaddleOCR adapter contract

Provider endpoint:

```text
POST https://paddleocr.aistudio-app.com/api/v2/ocr/jobs
GET  https://paddleocr.aistudio-app.com/api/v2/ocr/jobs/{jobId}
```

Required environment:

```text
AUDIT_OCR_PROVIDER=paddleocr
PADDLEOCR_API_BASE_URL=https://paddleocr.aistudio-app.com/api/v2/ocr
PADDLEOCR_API_TOKEN=<secret>
PADDLEOCR_MODEL=PaddleOCR-VL-1.5
PADDLEOCR_POLL_INTERVAL_MS=5000
```

Submission modes:

- Prefer `fileUrl` mode after the source PDF is uploaded to object storage and exposed through a short-lived signed URL.
- Use multipart `file` mode only in trusted server-side workers or background jobs, not from browser code.

Optional payload defaults:

```json
{
  "useDocOrientationClassify": false,
  "useDocUnwarping": false,
  "useChartRecognition": false
}
```

State mapping:

| PaddleOCR state | Internal status | Notes |
| --- | --- | --- |
| `pending` | `queued` | Job accepted but not extracting yet |
| `running` | `running` | Use `extractProgress.totalPages` and `extractProgress.extractedPages` for progress |
| `done` | `complete` | Download `resultUrl.jsonUrl` and normalize JSONL |
| `failed` | `failed` | Persist `errorMsg` into job status |

JSONL normalization:

- Fetch `resultUrl.jsonUrl` after `done`.
- Parse one JSON object per line.
- For each line, read `result.layoutParsingResults`.
- Preserve each page's `markdown.text` as the primary OCR text.
- Download markdown images/output images only if a later UI requirement needs visual evidence.
- Convert markdown text into the current `ocr.txt` page block format or a provider-neutral intermediate that the existing date extractor can consume.

## Implemented boundary in this pass

- `web/src/lib/paddleocr.ts`
  - creates runtime config from environment variables,
  - builds URL-mode job requests,
  - submits provider jobs,
  - polls provider job status,
  - maps PaddleOCR states to internal audit statuses,
  - parses provider JSONL markdown,
  - converts markdown pages to the current `ocr.txt` block format.
- `POST /api/audit/paddleocr/jobs`
  - accepts `{ "fileUrl": "<http-url>" }`,
  - requires the existing audit auth,
  - returns `{ "providerJobId": "<jobId>" }`.
- `GET /api/audit/paddleocr/jobs/{jobId}/status`
  - requires the existing audit auth,
  - returns `{ "snapshot": ... }` with normalized status/progress/result URL fields.
- `web/src/lib/cloud-object-store.ts`
  - creates S3-compatible signed PUT/GET URLs for Cloudflare R2-style object storage,
  - validates PDF upload metadata,
  - generates `jobs/{jobId}/input.pdf` object keys,
  - rejects object keys outside the configured prefix.
- `POST /api/audit/cloud-uploads`
  - accepts `{ "filename": "...pdf", "size": 123, "contentType": "application/pdf" }`,
  - returns signed PUT upload details for direct browser/object-store upload.
- `POST /api/audit/cloud-uploads/paddleocr`
  - accepts `{ "objectKey": "jobs/<jobId>/input.pdf" }`,
  - creates a signed GET URL,
  - submits the signed URL to PaddleOCR,
  - creates an audit history row with `runtime=paddleocr`,
  - returns the audit job and provider job id.
- `GET /api/audit/jobs/{id}/status`
  - supports both `runtime=local-python` and `runtime=paddleocr`,
  - for PaddleOCR jobs, polls the provider and persists normalized status/message.
- `web/src/lib/audit-analyzer.ts`
  - turns PaddleOCR JSONL markdown into the current `ocr.txt` block format,
  - extracts validity dates into `result.json`,
  - generates `matches.csv`.
- Cloud result artifact persistence:
  - raw provider JSONL -> `paddleocr.jsonl`,
  - OCR text -> `ocr.txt`,
  - audit result -> `result.json`,
  - CSV matches -> `matches.csv`.
- `GET /api/audit/jobs/{id}/result` and `GET /api/audit/jobs/{id}/download/{file}`
  - support `runtime=paddleocr` by reading or redirecting to object-storage artifacts.

These are provider/storage-boundary endpoints wired into the existing history/status/result/download flow.
