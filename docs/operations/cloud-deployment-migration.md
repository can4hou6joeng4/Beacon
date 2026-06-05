# Cloud Deployment Migration Runbook

This document describes the Cloudflare-only production deployment for the PDF certificate expiry checker. The service now uses the public hostname `pdf-audit.bobochang.cn` directly on a Cloudflare Worker custom domain. The old local Mac + Cloudflare Tunnel route is historical and must not be treated as the business runtime.

## Production Runtime

The production runtime is intentionally cloud-only:

- `pdf-audit.bobochang.cn` is bound to the Cloudflare Worker `pdf-certificate-expiry-checker`.
- `web/` is built with OpenNext and deployed to Cloudflare Workers.
- Uploaded PDFs and generated artifacts are stored in the R2 bucket `pdf-audit-artifacts`.
- OpenNext incremental cache assets are stored in the R2 bucket `pdf-audit-opennext-cache`.
- Job history/status is stored in the D1 database `pdf-audit-db`.
- OCR is submitted to PaddleOCR asynchronously with model `PaddleOCR-VL-1.6`.
- Runtime secrets are Cloudflare Worker secrets: `AUTH_BOOTSTRAP_TOKEN`,
  `PADDLEOCR_API_TOKEN`, `AUDIT_OBJECT_ACCESS_KEY_ID`, and
  `AUDIT_OBJECT_SECRET_ACCESS_KEY`.

The previous local Mac runtime has been retired and removed from source control:

- no root-level Python OCR service,
- no Swift PDFKit/Vision OCR helper,
- no static local workbench,
- no `deploy/local` LaunchAgent or Cloudflare Tunnel scripts,
- no local chunk-upload filesystem store.

Do not restore LaunchAgents, a local Python/Swift OCR service, or Tunnel routing
for production operation. Use Cloudflare Worker rollback or cloud OCR/provider
configuration changes instead.

## Feasibility Summary

Cloud deployment is feasible because the business runtime no longer depends on
macOS-only OCR frameworks. The retired local OCR engine used PDFKit, Vision, and
AppKit, which cannot run inside Cloudflare Workers, Vercel Functions, Linux
containers, or most VPS environments. The active architecture replaces that path
with PaddleOCR.

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
                             +--> PaddleOCR API (PaddleOCR-VL-1.6)
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

- Replace local chunk files with direct or Worker-mediated object storage upload.
- Replace production local persistence with D1.
- Store source PDFs and generated artifacts under deterministic object keys.
- Keep SQLite only as a local/test fallback.

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
- Secrets `AUTH_BOOTSTRAP_TOKEN`, `PADDLEOCR_API_TOKEN`,
  `AUDIT_OBJECT_ACCESS_KEY_ID`, and `AUDIT_OBJECT_SECRET_ACCESS_KEY`.

The active Cloudflare production resources are already created and configured in
`web/wrangler.jsonc`. For a new account or disaster recovery environment,
create the resources and set the resulting D1 database id in that file:

```bash
cd web
npx wrangler r2 bucket create pdf-audit-artifacts
npx wrangler r2 bucket create pdf-audit-opennext-cache
npx wrangler d1 create pdf-audit-db
npx wrangler d1 migrations apply pdf-audit-db --remote
npx wrangler secret put AUTH_BOOTSTRAP_TOKEN
npx wrangler secret put PADDLEOCR_API_TOKEN
npx wrangler secret put AUDIT_OBJECT_ACCESS_KEY_ID
npx wrangler secret put AUDIT_OBJECT_SECRET_ACCESS_KEY
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

Create a signed upload URL from an authenticated browser session:

```bash
curl -sS \
  -X POST 'https://pdf-audit.bobochang.cn/api/audit/cloud-uploads' \
  -H 'Cookie: pdf_audit_session=<session-token>' \
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
  -X POST 'https://pdf-audit.bobochang.cn/api/audit/cloud-uploads/paddleocr' \
  -H 'Cookie: pdf_audit_session=<session-token>' \
  -H 'Content-Type: application/json' \
  -d '{"jobId":"<job-id>","objectKey":"jobs/<job-id>/input.pdf"}'
```

This creates a short-lived signed GET URL and submits that URL to PaddleOCR. The
response returns `providerJobId`, and task progress is polled through
`GET /api/audit/jobs/{id}/status`.

### Phase 3: PaddleOCR provider adapter

Implement a PaddleOCR async provider adapter. The current preferred model is `PaddleOCR-VL-1.6`.

The adapter should expose a repo-local contract, independent of the provider:

```text
startOcrJob(jobId, inputObjectKey) -> providerJobId
getOcrJobStatus(providerJobId) -> queued | running | complete | failed
collectOcrOutput(providerJobId) -> normalized page text + metadata
```

The TypeScript analyzer in `web/src/lib/audit-analyzer.ts` is now the active
date extraction and classification implementation. Regression cases migrated
from the retired Python extractor live under `web/src/lib/__tests__/`.

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
PADDLEOCR_MODEL=PaddleOCR-VL-1.6
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
     "model": "PaddleOCR-VL-1.6",
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
- Runtime config helper: `web/src/lib/paddleocr-runtime.ts`
- Cloud upload session endpoint: `POST /api/audit/cloud-uploads`
- Submit uploaded object to PaddleOCR: `POST /api/audit/cloud-uploads/paddleocr`
- Poll job status/finalization: `GET /api/audit/jobs/{id}/status`
- Read results/download artifacts: `GET /api/audit/jobs/{id}/result` and
  `GET /api/audit/jobs/{id}/download/{file}`

The direct provider routes under `/api/audit/paddleocr/jobs` intentionally
return `410` so provider job access stays scoped through authenticated audit
jobs, ownership checks, and quota accounting.

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
- Cloudflare Containers can run Linux container workloads, but cannot run macOS
  PDFKit or Vision.

## Validation Plan

Minimum checks:

1. Code quality:

   ```bash
   cd web
   npm run test
   npm run lint
   npm run build
   npm run cf:build
   ```

2. Public endpoint validation:

   ```bash
   curl -I 'https://pdf-audit.bobochang.cn/'
   curl -fsS 'https://pdf-audit.bobochang.cn/api/auth/me'
   ```

   The unauthenticated `/api/auth/me` request should return `401` JSON.

## Rollback

Production rollback should remain cloud-native:

1. Use Wrangler/Cloudflare Dashboard deployment rollback to restore the last known-good Worker version.
2. Keep `pdf-audit.bobochang.cn` bound to the Worker custom domain.
3. If OCR is failing but the app is healthy, disable new submissions or switch to an alternate cloud OCR provider/configuration.
4. Verify:

   ```bash
   curl -I 'https://pdf-audit.bobochang.cn/'
   ```

## Open Implementation Decisions

- Validate PaddleOCR limits, pricing, retention policy, and output quality for production PDFs.
- Decide whether PaddleOCR URL mode can consume R2 signed URLs directly; if not, use trusted server-side multipart submission.
- Decide retention policy for source PDFs and artifacts.

## Recommendation

Proceed with the Cloudflare Worker + R2 + D1 + PaddleOCR async provider architecture.

Do not use the retired local macOS OCR service for business traffic. It has been
removed from source control; historical design documents remain only as archived
context.
