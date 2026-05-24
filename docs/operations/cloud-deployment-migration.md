# Cloud Deployment Migration Runbook

This document describes the Cloudflare-only production deployment for the PDF certificate expiry checker. The service now uses the public hostname `pdf-audit.bobochang.cn` directly on a Cloudflare Worker custom domain. The old local Mac + Cloudflare Tunnel route is historical and must not be treated as the business runtime.

## Production Runtime

The production runtime is intentionally cloud-only:

- `pdf-audit.bobochang.cn` is bound to the Cloudflare Worker `pdf-certificate-expiry-checker`.
- `web/` is built with OpenNext and deployed to Cloudflare Workers.
- Uploaded PDFs and generated artifacts are stored in the R2 bucket `pdf-audit-artifacts`.
- OpenNext incremental cache assets are stored in the R2 bucket `pdf-audit-opennext-cache`.
- Job history/status is stored in the D1 database `pdf-audit-db`.
- OCR is submitted to PaddleOCR asynchronously with model `PaddleOCR-VL-1.5`.
- Runtime secrets are Cloudflare Worker secrets: `PADDLEOCR_API_TOKEN` and `PDF_CHECKER_TOKEN`.

Historical local components still exist in the repository, but they are no longer production services:

- `web/` runs the Next.js audit command center.
- `src/pdf_expiry_checker/server.py` runs the Python API/OCR service.
- `swift/pdf_audit.swift` performs PDF outline parsing, page rendering, macOS Vision OCR, and Tesseract fallback.
- `web/src/lib/audit-db.ts` stores history in local SQLite through `better-sqlite3`.
- `web/src/lib/upload-store.ts` stages chunked uploads in the local filesystem.
- `deploy/local/*` installs macOS LaunchAgents for Next.js, Python, and `cloudflared`.
- Cloudflare Tunnel maps `pdf-audit.bobochang.cn` to `http://127.0.0.1:3000`.

Those local pieces are useful as legacy reference/test code only. Do not restore LaunchAgents or Tunnel routing for production operation.

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

Cloudflare remains the public front door because the domain and existing hostname are already there. The hostname now routes to the cloud app instead of a local Tunnel.

## Recommended MVP Path

### Phase 1: Cloud-ready boundary

Add the cloud architecture and contracts without using local service startup as a production dependency.

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

For Cloudflare Workers deployment, prefer native R2 and D1 bindings instead of
S3 credentials:

```text
AUDIT_DB_DRIVER=d1
AUDIT_OBJECT_STORE_DRIVER=r2-binding
AUDIT_OBJECT_PREFIX=jobs
```

The current Worker config lives in `web/wrangler.jsonc` and expects:

- D1 binding `AUDIT_DB` with database name `pdf-audit-db`.
- R2 binding `AUDIT_BUCKET` with bucket name `pdf-audit-artifacts`.
- R2 binding `NEXT_INC_CACHE_R2_BUCKET` with bucket name `pdf-audit-opennext-cache`
  for OpenNext incremental cache.
- Secrets `PADDLEOCR_API_TOKEN` and `PDF_CHECKER_TOKEN`.

The active Cloudflare production resources are already created and configured in
`web/wrangler.jsonc`. For a new account or disaster recovery environment,
create the resources and set the resulting D1 database id in that file:

```bash
cd web
npx wrangler r2 bucket create pdf-audit-artifacts
npx wrangler r2 bucket create pdf-audit-opennext-cache
npx wrangler d1 create pdf-audit-db
npx wrangler d1 migrations apply pdf-audit-db --remote
npx wrangler secret put PADDLEOCR_API_TOKEN
npx wrangler secret put PDF_CHECKER_TOKEN
```

Then build and deploy through OpenNext:

```bash
npm run cf:build
npm run cf:deploy
```

### Performance verification

The cloud upload and PaddleOCR status endpoints emit `Server-Timing` headers for
the hot execution path. Use them after deployment to compare:

- upload session creation: `quota_check`, `d1_create_job`, `quota_reserve`
- Worker-to-R2 upload: `r2_put`, `d1_status`
- PaddleOCR submission: `d1_get_job`, `quota_consume_job`, `paddle_submit`,
  `d1_provider_job`
- status/finalization: `paddle_status`, `r2_result_check`,
  `paddle_result_fetch`, `analyze_result`, `r2_artifacts_put`, `d1_result`

On this development machine, Clash Verge TUN mode can affect local DNS answers.
Do not treat local `dig` output alone as production routing evidence. Prefer
HTTPS response headers, Cloudflare dashboard/API evidence, or Cloudflare DoH
queries when checking whether `pdf-audit.bobochang.cn` is routed to the Worker.

Create a signed upload URL:

```bash
curl -sS \
  -X POST 'https://pdf-audit.bobochang.cn/api/audit/cloud-uploads?token=<pdf-checker-token>' \
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
  -X POST 'https://pdf-audit.bobochang.cn/api/audit/cloud-uploads/paddleocr?token=<pdf-checker-token>' \
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

Submit a publicly reachable or signed PDF URL:

```bash
curl -sS \
  -X POST 'https://pdf-audit.bobochang.cn/api/audit/paddleocr/jobs?token=<pdf-checker-token>' \
  -H 'Content-Type: application/json' \
  -d '{"fileUrl":"https://example.com/input.pdf"}'
```

Poll the provider job:

```bash
curl -sS 'https://pdf-audit.bobochang.cn/api/audit/paddleocr/jobs/<jobId>/status?token=<pdf-checker-token>'
```

These endpoints intentionally do not replace the current local upload flow yet. They establish the provider boundary first; the next migration step is to connect object storage, job history, and result artifact persistence.

The cloud upload endpoints now connect object storage to PaddleOCR submission, and the PaddleOCR cloud path is recorded in the existing audit history table with `runtime=paddleocr`, `objectKey`, and `providerJobId`. When PaddleOCR reaches `done`, the app downloads `resultUrl.jsonUrl`, normalizes markdown into `ocr.txt`, generates `result.json` and `matches.csv`, and writes all artifacts back next to the source object. Cloud jobs can therefore be tracked, opened as result reports, and downloaded through the existing result/download endpoints.

### Phase 4: DNS cutover

Cutover is complete: `pdf-audit.bobochang.cn` is served by the Cloudflare Worker custom domain.

Historical route:

```text
pdf-audit.bobochang.cn -> Cloudflare Tunnel -> local Mac -> Next.js :3000 -> Python :8787
```

Active route:

```text
pdf-audit.bobochang.cn -> Cloudflare Worker/Pages/custom origin -> cloud app
```

Do not keep the named Tunnel and LaunchAgent path as production rollback. Use Cloudflare Worker deployment rollback or switch OCR/provider configuration in the cloud if needed.

## Option Comparison

| Option | Description | Fit |
| --- | --- | --- |
| Cloudflare front door + PaddleOCR | Worker/OpenNext app, object storage, cloud DB, async PaddleOCR-VL OCR | Recommended for true cloud operation |
| Cloudflare front door + Linux OCR container | Worker/OpenNext app plus a containerized OCR service using Linux-compatible PDF/OCR tools | Best if self-hosted data control matters |
| Remote macOS OCR host | Move the current Python/Swift service to a hosted Mac and route to it | Historical fallback only; not preferred because the current direction is cloud-only |
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

5. Public endpoint validation:

   ```bash
   curl -I 'https://pdf-audit.bobochang.cn/'
   curl -sS 'https://pdf-audit.bobochang.cn/api/audit/history'
   ```

## Rollback

Production rollback should remain cloud-native:

1. Use Wrangler/Cloudflare Dashboard deployment rollback to restore the last known-good Worker version.
2. Keep `pdf-audit.bobochang.cn` bound to the Worker custom domain.
3. If OCR is failing but the app is healthy, disable new submissions or switch to an alternate cloud OCR provider/configuration.
4. Verify:

   ```bash
   curl -I 'https://pdf-audit.bobochang.cn/?token=<pdf-checker-token>'
   ```

## Open Implementation Decisions

- Validate PaddleOCR limits, pricing, retention policy, and output quality for production PDFs.
- Decide whether PaddleOCR URL mode can consume R2 signed URLs directly; if not, use trusted server-side multipart submission.
- Choose job database: Cloudflare D1 vs Turso/Postgres.
- Choose where result normalization runs: Worker, container, or background job runner.
- Choose authentication model: keep shared token initially, or move to Cloudflare Access/Zero Trust.
- Decide retention policy for source PDFs and artifacts.

## Recommendation

Proceed with the Cloudflare Worker + R2 + D1 + PaddleOCR async provider architecture.

Do not use the current local macOS OCR service for business traffic. It can remain in source control as legacy reference code until it is intentionally removed in a later cleanup task.
