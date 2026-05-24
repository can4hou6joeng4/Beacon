# brainstorm: optimize Cloudflare performance

## Goal

Optimize the deployed Cloudflare version of the PDF certificate expiry checker so users see faster page access, smoother upload/processing flow, and lower Worker execution pressure during OCR-heavy jobs.

## What I already know

- The current production entry is `https://pdf-audit.bobochang.cn/?token=<pdf-checker-token>`.
- Production is cloud-only: Cloudflare Worker/OpenNext app, R2 object storage, D1 history/status database, and PaddleOCR async provider.
- The old local macOS OCR service and Cloudflare Tunnel path are historical reference only and should not be restored as the production path.
- `web/wrangler.jsonc` binds `AUDIT_BUCKET`, `NEXT_INC_CACHE_R2_BUCKET`, and `AUDIT_DB`, and sets `AUDIT_RUNTIME_MODE=paddleocr`.
- `web/src/app/page.tsx` does an authenticated server render and loads the latest 20 jobs from D1 before rendering the command center.
- The upload flow creates a D1 job, uploads the PDF through `/api/audit/cloud-uploads/[jobId]/file`, submits to PaddleOCR, then polls `/api/audit/jobs/[id]/status`.
- In current R2 binding mode, the Worker buffers the uploaded PDF with `request.blob()` before writing to R2.
- In current PaddleOCR submission, the Worker reads the uploaded PDF back from R2 as a Blob and submits it as multipart file upload.
- When PaddleOCR completes, the status route downloads provider JSONL, analyzes it, writes `paddleocr.jsonl`, `ocr.txt`, `matches.csv`, and `result.json` to R2, and updates D1 inside the polling request.

## Assumptions (temporary)

- The main pain is likely in job execution and upload/OCR handoff, not only first-page load.
- Keeping the Cloudflare-only architecture is preferred unless a future benchmark shows the OCR provider path is the hard blocker.
- Optimization should preserve authentication, quotas, D1 auditability, and saved history.

## Open Questions

- None for the current MVP slice.

## Requirements (evolving)

- Preserve the current Cloudflare Worker + R2 + D1 + PaddleOCR production architecture.
- Identify measurable bottlenecks before broad rewrites.
- Avoid changes that weaken per-user auth, quota accounting, or artifact ownership.
- Prefer scoped improvements that can be verified with local tests plus deployed timing/headers.
- Prioritize Approach A: execution hot path optimization for upload, R2 handoff, PaddleOCR submission, polling, and result finalization.
- Treat local DNS checks carefully because this machine uses Clash Verge TUN mode; do not rely on local `dig` alone for production DNS or routing conclusions.

## Acceptance Criteria (evolving)

- [x] A baseline measurement plan exists for page load, upload session creation, PDF upload, PaddleOCR submission, polling, and result finalization.
- [x] The execution hot path reduces at least one measured latency or Worker memory/CPU-heavy path.
- [x] Existing audit, auth, quota, R2, D1, and PaddleOCR tests pass or are updated to cover changed behavior.
- [x] Deployment notes describe how to verify the improvement on Cloudflare.
- [x] DNS/routing verification notes account for Clash Verge TUN mode on the local machine.

## Definition of Done (team quality bar)

- Tests added/updated where behavior changes.
- Lint, typecheck, and relevant test suite green.
- Docs/notes updated if deployment behavior or verification commands change.
- Rollout/rollback considered for risky runtime changes.

## Research References

- [`research/cloudflare-runtime-performance.md`](research/cloudflare-runtime-performance.md) - Smart Placement, Worker cache, and static asset considerations for this app.
- [`research/r2-d1-ocr-bottlenecks.md`](research/r2-d1-ocr-bottlenecks.md) - R2, D1, and PaddleOCR bottleneck mapping against current code.

## Research Notes

### What similar Cloudflare apps optimize

- Separate first-page/static asset performance from backend-heavy API flow performance.
- Use placement controls when Workers make repeated calls to backend services where network round trips dominate.
- Keep D1 queries index-friendly because each individual D1 database serializes work and throughput depends on query duration.
- Avoid proxying large files through Worker memory when object storage direct transfer or streaming is possible.

### Constraints from this repo/project

- Authentication and quota checks are not optional; upload, OCR job, page usage, and history ownership need to remain auditable.
- The PaddleOCR provider currently supports URL submission and file submission in repo code, but the Cloudflare `r2-binding` path uses file submission because it has no public/S3 presigned GET URL.
- The completion path is idempotent via checking whether `result.json` already exists, but the first completion poll performs all artifact-generation work.

### Feasible approaches here

**Approach A: Execution Hot Path Optimization** (Recommended)

- How it works: reduce large Blob round trips, make completion finalization lighter/idempotent, add query indexes matching history lookups, and optionally enable Smart Placement for backend-heavy requests.
- Pros: most likely to improve the expensive real workflow; directly targets Worker memory/CPU and OCR handoff latency.
- Cons: touches API behavior and needs careful deployment verification.
- Selected for the MVP.

**Approach B: Access/Page Load Optimization**

- How it works: measure first load, tune static asset caching, reduce initial D1 work, lazy-load heavy UI/admin/chart/history pieces, and keep authenticated dynamic responses no-store.
- Pros: improves perceived entry speed and is usually lower risk.
- Cons: does not substantially reduce OCR job duration if PaddleOCR/R2 handoff is the bottleneck.

**Approach C: Observability First**

- How it works: add timing headers/server-timing fields, structured duration logs, and a repeatable Cloudflare verification script before changing major behavior.
- Pros: gives trustworthy baseline and prevents optimization by guesswork.
- Cons: user-visible speed may not improve in the first slice except through incidental cleanup.

## Expansion Sweep

### Future evolution

- The job pipeline may later need real background finalization rather than doing provider collection in a polling request.
- The OCR adapter may later support multiple providers or fallbacks if PaddleOCR latency/reliability becomes the dominant blocker.

### Related scenarios

- History browsing, reanalysis, downloads, and admin quota panels should remain consistent with any D1/R2 performance changes.
- Upload retry and quota refund behavior must remain correct if the upload path changes.

### Failure and edge cases

- Large PDFs near 100 MB should not cause Worker memory pressure or timeout.
- Repeated polling after provider completion must not duplicate artifact writes or double-consume quotas.
- Provider/API failures should keep current refund/failure semantics.

## Out of Scope (explicit)

- Returning to the local macOS OCR/Tunnel production path.
- Replacing PaddleOCR with a new OCR provider in the first optimization slice.
- Weakening auth/token checks to gain cacheability.
- Caching private user job result responses globally.
- DNS infrastructure changes, except verification notes needed to avoid false local conclusions under Clash Verge TUN mode.

## Decision (ADR-lite)

**Context**: The deployed application already runs on Cloudflare Worker/OpenNext with R2, D1, and PaddleOCR. Repo inspection found the expensive path is likely the upload/OCR/result lifecycle rather than only the app shell.

**Decision**: Start with Approach A, execution hot path optimization. The first implementation slice will prioritize measurable improvements around large PDF upload handling, R2/PaddleOCR handoff, D1 query shape, and completion finalization observability.

**Consequences**: This should improve the real audit workflow sooner than page-only tuning, but changes must preserve auth, quotas, object ownership, and idempotency. Deployment verification must avoid single-source local DNS evidence because Clash Verge TUN mode can distort local DNS results.

## Technical Notes

- Inspected `web/wrangler.jsonc`, `web/src/app/page.tsx`, `web/src/components/audit/audit-command-center.tsx`, `web/src/app/api/audit/cloud-uploads/route.ts`, `web/src/app/api/audit/cloud-uploads/[jobId]/file/route.ts`, `web/src/app/api/audit/cloud-uploads/paddleocr/route.ts`, `web/src/app/api/audit/jobs/[id]/status/route.ts`, `web/src/app/api/audit/jobs/[id]/result/route.ts`, `web/src/lib/cloud-object-store.ts`, `web/src/lib/audit-db-d1.ts`, `web/src/lib/paddleocr.ts`, and `web/migrations/*.sql`.
- Current D1 migrations include `idx_jobs_created_at`, `idx_jobs_provider_job_id`, and `idx_jobs_user_id`, but not a compound index for user-scoped created-at ordering.
- Official Cloudflare docs checked 2026-05-24 for Workers Placement, Cache API, R2 cache/custom domain, D1 limits/indexes, and AI Gateway capabilities.
- Local DNS/routing checks must consider Clash Verge TUN mode. Prefer HTTPS response headers, Cloudflare dashboard/API evidence, and Cloudflare DoH when validating public routing.

## Implementation Summary

- Added `putCloudObjectStream(...)` and changed the Worker upload route to stream `request.body` into R2 instead of buffering the full PDF with `request.blob()`.
- Added `Server-Timing` instrumentation for upload session creation, R2 upload, PaddleOCR submission, provider polling, completion finalization, R2 artifact writes, and D1 updates.
- Added D1 migration `0004_job_history_indexes.sql` plus matching SQLite fallback indexes for job history queries.
- Updated deployment runbook with hot-path timing verification and Clash Verge TUN DNS caution.
- Updated code-spec docs for streaming upload, Server-Timing usage, and job history indexes.

## Verification

- `cd web && npm run test` - passed
- `cd web && npm run lint` - passed
- `cd web && npm run build` - passed
- `cd web && npm run cf:build` - passed
- `git diff --check` - passed
