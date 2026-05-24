# R2, D1, and OCR Bottleneck Research

## Sources

- Cloudflare R2 public bucket/custom domain docs, checked 2026-05-24: R2 objects can be accelerated through Cloudflare Cache when accessed through a custom domain.
- Cloudflare D1 limits and index docs, checked 2026-05-24: individual D1 databases process queries serially, throughput depends heavily on query duration, and appropriate indexes are required for common queries.
- Cloudflare AI Gateway docs, checked 2026-05-24: AI Gateway supports analytics, rate limiting, retries, fallback, and exact-match caching for supported model-provider requests, but cache benefits are limited for unique file/OCR payloads.

## Project Mapping

- Current R2 binding mode creates upload session URLs that point back through the Worker: `PUT /api/audit/cloud-uploads/[jobId]/file`.
- That upload route calls `request.blob()` before writing to R2, so the Worker buffers the full PDF.
- The PaddleOCR submission route, in R2 binding mode, reads the uploaded PDF back from R2 into a Blob and submits it as multipart file upload. This adds Worker CPU/memory pressure and an extra R2 read before provider submission.
- The status route does several jobs when PaddleOCR completes: provider status fetch, result JSONL download, TypeScript analysis, quota update, four R2 artifact writes, and D1 summary updates. This completion work happens inside a user polling request.
- Existing D1 schema has indexes for global created-at, provider job id, user id, and quota ledger lookups. User history query filters by `user_id` and orders by `created_at`; a compound `(user_id, created_at DESC, id DESC)` index may reduce scans as history grows.

## Candidate Actions

- Prefer a direct upload/download URL path where possible so large PDFs do not traverse Worker memory twice.
- If R2 binding must remain, stream rather than materialize large uploads where the runtime and provider API allow it.
- Move completion finalization out of frequent polling or make it idempotent and lightweight, because the first `status=done` poll currently bears the full artifact-generation cost.
- Add D1 compound indexes for the actual list/query shapes before history volume grows.
- Consider Cloudflare AI Gateway only for observability/rate-limiting/fallback if PaddleOCR can be routed through it; exact-match caching is unlikely to help unique PDF OCR submissions.

