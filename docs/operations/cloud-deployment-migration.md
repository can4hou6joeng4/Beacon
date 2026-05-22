# Cloud Deployment Migration Runbook

This document describes how to move the PDF certificate expiry checker from the current local Mac + Cloudflare Tunnel setup to a cloud-hosted service while preserving the public hostname `pdf-audit.bobochang.cn`.

## Current Runtime

The current production-like runtime is intentionally local:

- `web/` runs the Next.js audit command center.
- `src/pdf_expiry_checker/server.py` runs the Python API/OCR service.
- `swift/pdf_audit.swift` performs PDF outline parsing, page rendering, macOS Vision OCR, and Tesseract fallback.
- `web/src/lib/audit-db.ts` stores history in local SQLite through `better-sqlite3`.
- `web/src/lib/upload-store.ts` stages chunked uploads in the local filesystem.
- `deploy/local/*` installs macOS LaunchAgents for Next.js, Python, and `cloudflared`.
- Cloudflare Tunnel maps `pdf-audit.bobochang.cn` to `http://127.0.0.1:3000`.

This is reliable enough for a workstation-hosted tool, but it still depends on the local Mac being awake, online, and healthy.

## Feasibility Summary

Cloud deployment is feasible, but the current OCR engine cannot be lifted unchanged into ordinary Linux/serverless hosting.

The hard dependency is `swift/pdf_audit.swift`:

```swift
import PDFKit
import Vision
import AppKit
```

Those frameworks are macOS-only. Cloudflare Workers, Vercel Functions, Linux containers, and most VPS environments cannot run that code as-is. A real cloud migration must either replace the OCR execution path or move it to a managed macOS host.

## Recommended Target Architecture

```text
Browser
  |
  v
pdf-audit.bobochang.cn
  |
  v
Cloudflare Worker / OpenNext app
  |        |          |
  |        |          +--> Cloud database: job history and status
  |        +-------------> Object storage: PDFs and artifacts
  |
  +----------------------> Async OCR adapter
                             |
                             +--> PaddleOCR API (PaddleOCR-VL-1.5)
                             +--> fallback: AWS Textract or Google Cloud Vision
                             +--> fallback: Linux OCR container
                             +--> fallback: remote macOS OCR host
```

Cloudflare remains the public front door because the domain and existing hostname are already there. The long-term change is that the hostname should route to the cloud app instead of a local Tunnel.

## Recommended MVP Path

### Phase 1: Cloud-ready boundary

Keep the existing local service working. Add the cloud architecture and contracts before moving production traffic.

Required boundaries:

- Uploads must be stored in object storage, not reconstructed into a large in-memory `Blob`.
- Job history must move out of local SQLite.
- OCR execution must become an environment-selected adapter.
- Job processing must be asynchronous.
- Artifacts should keep the current names:
  - `result.json`
  - `matches.csv`
  - `ocr.txt`
  - `manifest.json`

### Phase 2: Cloud storage and history

Replace local-only state:

- Replace `web/src/lib/upload-store.ts` local chunk files with direct multipart object storage upload.
- Replace `better-sqlite3` with D1, Turso, Postgres, or another cloud database.
- Store source PDFs and generated artifacts under deterministic object keys.
- Remove the current local upload-store filesystem dependency before deploying to an immutable/serverless runtime. The current build already warns that `web/src/lib/upload-store.ts` causes broad Turbopack/NFT tracing because it performs dynamic filesystem work.

Suggested object key shape:

```text
jobs/{jobId}/input.pdf
jobs/{jobId}/manifest.json
jobs/{jobId}/ocr.txt
jobs/{jobId}/result.json
jobs/{jobId}/matches.csv
```

Implemented cloud upload boundary:

- Storage helper: `web/src/lib/cloud-object-store.ts`
- Create signed upload endpoint: `POST /api/audit/cloud-uploads`
- Submit uploaded object to PaddleOCR: `POST /api/audit/cloud-uploads/paddleocr`

Object storage mode is S3-compatible so it can target Cloudflare R2:

```text
AUDIT_OBJECT_STORE_DRIVER=r2-s3
NEXT_PUBLIC_AUDIT_RUNTIME_MODE=paddleocr
AUDIT_OBJECT_STORE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
AUDIT_OBJECT_BUCKET=pdf-audit-artifacts
AUDIT_OBJECT_PREFIX=jobs
AUDIT_OBJECT_REGION=auto
AUDIT_OBJECT_ACCESS_KEY_ID=<secret>
AUDIT_OBJECT_SECRET_ACCESS_KEY=<secret>
AUDIT_OBJECT_UPLOAD_EXPIRES_SECONDS=900
AUDIT_OBJECT_DOWNLOAD_EXPIRES_SECONDS=3600
```

Create a signed upload URL:

```bash
curl -sS \
  -X POST 'http://127.0.0.1:3000/api/audit/cloud-uploads?token=<pdf-checker-token>' \
  -H 'Content-Type: application/json' \
  -d '{"filename":"input.pdf","size":123456,"contentType":"application/pdf"}'
```

The response contains:

```json
{
  "objectKey": "jobs/<job-id>/input.pdf",
  "uploadUrl": "<signed-put-url>",
  "uploadExpiresAt": "...",
  "method": "PUT",
  "headers": { "Content-Type": "application/pdf" }
}
```

Upload the file directly to object storage:

```bash
curl -X PUT '<signed-put-url>' \
  -H 'Content-Type: application/pdf' \
  --data-binary @input.pdf
```

Submit the uploaded object to PaddleOCR:

```bash
curl -sS \
  -X POST 'http://127.0.0.1:3000/api/audit/cloud-uploads/paddleocr?token=<pdf-checker-token>' \
  -H 'Content-Type: application/json' \
  -d '{"objectKey":"jobs/<job-id>/input.pdf"}'
```

This creates a short-lived signed GET URL and submits that URL to PaddleOCR. The response returns `providerJobId`, which can be polled through `GET /api/audit/paddleocr/jobs/{jobId}/status`.

### Phase 3: PaddleOCR provider adapter

Implement a PaddleOCR async provider adapter. The current preferred model is `PaddleOCR-VL-1.5`.

The adapter should expose a repo-local contract, independent of the provider:

```text
startOcrJob(jobId, inputObjectKey) -> providerJobId
getOcrJobStatus(providerJobId) -> queued | running | complete | failed
collectOcrOutput(providerJobId) -> normalized page text + metadata
```

The existing date extraction logic in `src/pdf_expiry_checker/extractor.py` should remain the comparison baseline until a TypeScript or cloud-native equivalent is verified.

Provider endpoint:

```text
POST https://paddleocr.aistudio-app.com/api/v2/ocr/jobs
GET  https://paddleocr.aistudio-app.com/api/v2/ocr/jobs/{jobId}
```

Required secrets/config:

```text
AUDIT_OCR_PROVIDER=paddleocr
PADDLEOCR_API_BASE_URL=https://paddleocr.aistudio-app.com/api/v2/ocr
PADDLEOCR_API_TOKEN=<secret>
PADDLEOCR_MODEL=PaddleOCR-VL-1.5
PADDLEOCR_POLL_INTERVAL_MS=5000
```

Never commit the real PaddleOCR bearer token. Store it in the deployment provider's encrypted secret system.

Recommended submission flow:

1. Upload the PDF to object storage.
2. Generate a short-lived signed URL for the source PDF.
3. Submit the job in URL mode:

   ```json
   {
     "fileUrl": "<signed-url>",
     "model": "PaddleOCR-VL-1.5",
     "optionalPayload": {
       "useDocOrientationClassify": false,
       "useDocUnwarping": false,
       "useChartRecognition": false
     }
   }
   ```

4. Persist PaddleOCR `jobId` on the internal job row.
5. Poll the provider every 5 seconds at first.
6. Map provider states into internal statuses:

   | PaddleOCR state | Internal status | Action |
   | --- | --- | --- |
   | `pending` | `queued` | Keep waiting |
   | `running` | `running` | Persist progress from `extractProgress` when present |
   | `done` | `complete` | Fetch `resultUrl.jsonUrl` and normalize JSONL |
   | `failed` | `failed` | Persist `errorMsg` |

7. When `done`, fetch the JSONL result.
8. For each line, parse `result.layoutParsingResults[]`.
9. Treat `markdown.text` as the primary OCR page text.
10. Persist provider raw JSONL plus normalized artifacts.

Markdown images and `outputImages` should be optional in the first cloud MVP. Download them later only if the UI needs visual evidence images.

Implemented repo boundary:

- Provider helper: `web/src/lib/paddleocr.ts`
- Submit URL-mode job endpoint: `POST /api/audit/paddleocr/jobs`
- Poll provider status endpoint: `GET /api/audit/paddleocr/jobs/{jobId}/status`

Manual smoke test shape:

```bash
cd /Users/a1-6/Documents/pdf-certificate-expiry-checker/web
PADDLEOCR_API_TOKEN='<secret>' npm run dev
```

Submit a publicly reachable or signed PDF URL:

```bash
curl -sS \
  -X POST 'http://127.0.0.1:3000/api/audit/paddleocr/jobs?token=<pdf-checker-token>' \
  -H 'Content-Type: application/json' \
  -d '{"fileUrl":"https://example.com/input.pdf"}'
```

Poll the provider job:

```bash
curl -sS 'http://127.0.0.1:3000/api/audit/paddleocr/jobs/<jobId>/status?token=<pdf-checker-token>'
```

These endpoints intentionally do not replace the current local upload flow yet. They establish the provider boundary first; the next migration step is to connect object storage, job history, and result artifact persistence.

The cloud upload endpoints now connect object storage to PaddleOCR submission, and the PaddleOCR cloud path is recorded in the existing audit history table with `runtime=paddleocr`, `objectKey`, and `providerJobId`. When PaddleOCR reaches `done`, the app downloads `resultUrl.jsonUrl`, normalizes markdown into `ocr.txt`, generates `result.json` and `matches.csv`, and writes all artifacts back next to the source object. Cloud jobs can therefore be tracked, opened as result reports, and downloaded through the existing result/download endpoints.

### Phase 4: DNS cutover

Only cut over `pdf-audit.bobochang.cn` after cloud OCR parity is verified.

Current route:

```text
pdf-audit.bobochang.cn -> Cloudflare Tunnel -> local Mac -> Next.js :3000 -> Python :8787
```

Target route:

```text
pdf-audit.bobochang.cn -> Cloudflare Worker/Pages/custom origin -> cloud app
```

Keep the named Tunnel and LaunchAgent path as rollback until the cloud route has processed real PDFs successfully.

## Option Comparison

| Option | Description | Fit |
| --- | --- | --- |
| Cloudflare front door + PaddleOCR | Worker/OpenNext app, object storage, cloud DB, async PaddleOCR-VL OCR | Recommended for true cloud operation |
| Cloudflare front door + Linux OCR container | Worker/OpenNext app plus a containerized OCR service using Linux-compatible PDF/OCR tools | Best if self-hosted data control matters |
| Remote macOS OCR host | Move the current Python/Swift service to a hosted Mac and route to it | Lowest OCR-code change, but still machine-based |
| AWS/GCP/Azure provider OCR | Same cloud shape, but OCR goes to a large cloud document-OCR provider | Fallback if PaddleOCR is unsuitable |
| Vercel/Netlify-only | Host Next.js and keep serverless functions for everything | Not suitable for current OCR and local SQLite/filesystem assumptions |

## Cloudflare Notes

Cloudflare is a good front door and storage layer, but pure Workers are not the OCR engine.

Relevant constraints from current Cloudflare docs:

- Worker memory is 128 MB.
- Request body limit depends on plan: Free/Pro 100 MB, Business 200 MB, Enterprise 500 MB default.
- Next.js is supported through the OpenNext adapter.
- R2 supports large object storage and multipart upload.
- Cloudflare Containers can run Linux container workloads, but cannot run macOS `PDFKit` or `Vision`.

## Validation Plan

Use `投标文件.pdf` as the parity file because it previously exposed nested outline behavior.

Minimum checks:

1. Local baseline still passes:

   ```bash
   PYTHONPATH=src python3 -m unittest discover -s tests -v
   ```

2. Cloud candidate extracts the same or better certificate-page set from nested outlines.
3. PaddleOCR candidate produces comparable OCR/markdown text for certificate pages.
4. Result summary is compared with the known baseline from the local path:

   ```text
   certificate pages: 225
   pages OCR: 225
   validity candidates: 123
   matches before 2026-05-22: 0
   near expiry: 17
   needs review: 4
   ```

5. Public endpoint validation after DNS cutover:

   ```bash
   curl -I 'https://pdf-audit.bobochang.cn/'
   curl -sS 'https://pdf-audit.bobochang.cn/api/audit/history'
   ```

## Rollback

Before DNS cutover, rollback means continuing to use the existing Tunnel route.

After DNS cutover, rollback steps:

1. Restore the Cloudflare DNS/route for `pdf-audit.bobochang.cn` to the existing named Tunnel.
2. Reinstall or restart the local services:

   ```bash
   ./deploy/local/pdf-audit-service.sh install
   ./deploy/local/pdf-audit-service.sh status
   ```

3. Verify:

   ```bash
   curl -I 'https://pdf-audit.bobochang.cn/?token=<token>'
   ```

## Open Implementation Decisions

- Validate PaddleOCR limits, pricing, retention policy, and output quality for production PDFs.
- Decide whether PaddleOCR URL mode can consume R2 signed URLs directly; if not, use trusted server-side multipart submission.
- Choose job database: Cloudflare D1 vs Turso/Postgres.
- Choose where result normalization runs: Worker, container, or background job runner.
- Choose authentication model: keep shared token initially, or move to Cloudflare Access/Zero Trust.
- Decide retention policy for source PDFs and artifacts.

## Recommendation

Proceed with the Cloudflare front door + object storage + cloud database + PaddleOCR async provider architecture.

Do not remove the current local macOS OCR service until the cloud OCR adapter has passed parity checks against `投标文件.pdf` and one newly uploaded production PDF.
