# Fix Cloudflare R2 Binding PDF Upload

## Goal

Repair production PDF uploads after the Cloudflare-only auth/quota migration by
keeping the intended `r2-binding` storage mode and moving PDF bytes through the
Worker into the `AUDIT_BUCKET` R2 binding, instead of trying to generate S3
presigned URLs from a binding-only configuration.

## What I Already Know

- Production URL: `https://pdf-audit.bobochang.cn`.
- Current production storage contract:
  - `AUDIT_OBJECT_STORE_DRIVER=r2-binding`
  - R2 binding `AUDIT_BUCKET`
  - Object prefix `jobs`
- Current UI flow:
  - `POST /api/audit/cloud-uploads`
  - browser `PUT` to returned `uploadUrl`
  - `POST /api/audit/cloud-uploads/paddleocr`
- Current production failure is reproducible:
  - `POST /api/audit/cloud-uploads` returns `500`.
  - Response body: `{"error":"Invalid URL string."}`.
- Root cause:
  - `web/src/app/api/audit/cloud-uploads/route.ts` calls
    `createPresignedPutUrl(...)`.
  - `createPresignedPutUrl(...)` requires S3 endpoint/access-key config.
  - `r2-binding` production config has no endpoint/access-key because the Worker
    should use the R2 binding directly.
- Side effect already observed:
  - The failed API call can create a queued job and reserve upload quota before
    URL creation fails.
  - Remote D1 has failed upload attempts with `cloud_upload_reserved` ledger
    rows but no uploaded object.

## Research References

- [`research/r2-binding-upload-path.md`](research/r2-binding-upload-path.md) —
  explains why binding mode must use Worker-side R2 `put/get` instead of S3
  presigned URLs.

## Decision

Use solution 2 selected by the user:

- Keep `AUDIT_OBJECT_STORE_DRIVER=r2-binding`.
- Do not switch production to `r2-s3`.
- Do not introduce R2 S3 access keys for normal production upload.
- Upload PDFs through a same-origin authenticated Worker route, and write them
  to R2 through the `AUDIT_BUCKET` binding.
- Submit PaddleOCR jobs from the Worker by reading the private R2 object and
  posting it as a multipart file upload to PaddleOCR. Do not create a public R2
  download URL, do not add a separate signed-download secret, and do not expose
  the PDF to unauthenticated callers.
- For already-created failed upload attempts, use an auditable cleanup:
  refund upload-byte reservations and mark affected jobs as `failed`; do not
  hard-delete history rows.

## Requirements

- Preserve account/session authentication and user ownership checks.
- Preserve quota enforcement for:
  - upload bytes,
  - OCR jobs,
  - OCR pages.
- Align default and admin-configurable quota boundaries with the cloud service
  constraints in use:
  - Cloudflare R2 free Standard storage baseline: 10 GB-month per month.
  - Cloudflare R2 free operation baseline: 1,000,000 Class A operations per
    month and 10,000,000 Class B operations per month.
  - Cloudflare D1 free baseline: 5 GB total storage, 5,000,000 rows read per
    day, and 100,000 rows written per day.
  - PaddleOCR provider PDF parsing limit: 2,000 pages per day.
- Admin user/quota configuration must remain readable in the 360px sidebar
  without relying on a horizontally scrolling quota table.
- Evidence snippets must be readable when PaddleOCR returns Markdown/HTML table
  fragments or very long OCR lines.
- Expiry-date extraction must choose the date from the same validity field that
  produced the evidence snippet. Validity keywords include `有效期`,
  `使用有效期`, `有效期至`, and OCR-noisy variants already covered by the
  analyzer.
- Replace browser direct R2 presigned PUT for `r2-binding` mode with a
  same-origin Worker upload route.
- The Worker upload route must:
  - require an authenticated session,
  - verify the job belongs to the user,
  - verify the requested object key matches the job,
  - accept only PDF uploads,
  - enforce the existing 100MB maximum,
  - write bytes to `AUDIT_BUCKET.put(...)`,
  - return a clear JSON error on failure.
- `POST /api/audit/cloud-uploads` must not leave queued jobs or reserved quota
  when it cannot return a usable upload target.
- If Worker-side object upload fails after quota reservation, refund upload
  quota or otherwise create an auditable compensating ledger entry.
- Previously polluted rows from the `Invalid URL string` bug must be cleaned up
  by:
  - identifying queued jobs that have `cloud_upload_reserved` ledger entries
    but no uploaded R2 object and no provider job,
  - writing `refund` ledger entries for the reserved upload bytes,
  - marking those jobs `failed` with a message that identifies the legacy
    r2-binding upload-session bug,
  - preserving the job and ledger records for auditability.
- `POST /api/audit/cloud-uploads/paddleocr` must still be able to submit the
  uploaded PDF to PaddleOCR.
- In `r2-binding` mode, PaddleOCR submission must use PaddleOCR's local-file
  multipart mode:
  - fetch the private R2 object through `AUDIT_BUCKET.get(...)`,
  - build a `FormData` request with `file`, `model`, and `optionalPayload`,
  - send the request from the Worker with the `PADDLEOCR_API_TOKEN` secret,
  - avoid returning any provider token, file bytes, or private file URL to the
    browser.
- In `r2-s3` fallback mode, the existing presigned URL submission path may
  remain as a compatibility path.
- Clean up or compensate previously failed queued upload attempts caused by the
  `Invalid URL string` production bug.
- Keep local macOS service/tunnel paths out of the production fix.

## Acceptance Criteria

- [ ] Logged-in admin can upload a real PDF through the production UI.
- [ ] The production upload path stores the PDF in R2 using `AUDIT_BUCKET`.
- [ ] `POST /api/audit/cloud-uploads` no longer returns `Invalid URL string`
      with `r2-binding`.
- [ ] Failed upload-session creation does not consume quota or leave dangling
      jobs.
- [ ] Failed object upload creates a clear user-facing error and refunds or
      compensates upload-byte quota.
- [ ] PaddleOCR submission can read the uploaded private R2 object through a safe
      Worker-mediated fetch path and submit it through PaddleOCR multipart
      local-file mode.
- [ ] Previously polluted failed upload reservations are refunded and their jobs
      are marked `failed`, not deleted.
- [ ] Cleanup is idempotent: rerunning it does not double-refund the same upload
      reservation.
- [ ] Tests cover the `r2-binding` upload path and the quota-refund failure path.
- [ ] `npm run lint`, `npm run test`, `npm run build`, and `npm run cf:build`
      pass.
- [ ] Production deployment is updated and verified with a real PDF upload.
- [ ] `有效期：2027年09月25日 ... 2023-09-08` resolves to `2027-09-25`,
      not the unrelated trailing table/source date.
- [ ] Adjacent fields such as `使用有效期：2026年03月02日` and
      `有效期至 2026年05月31日` are extracted as separate candidates.
- [ ] Admin quota editing uses a stacked card layout and does not require a
      quota table scroll in the sidebar.
- [ ] Evidence previews and details strip Markdown/HTML table noise and wrap
      long text.
- [ ] Admin quota creation/update rejects upload quotas above 10GB and OCR page
      quotas above 2,000 pages.

## Out of Scope

- Switching production to `r2-s3`.
- Adding public R2 bucket access.
- Payment or monthly metering.
- Public self-signup.
- Restoring local Python/macOS upload service as a production fallback.

## Definition of Done

- PRD is confirmed.
- Relevant Trellis specs/research are persisted.
- Code is implemented and tested.
- Cloudflare Worker is deployed.
- A real PDF upload works in production using the account-authenticated flow.
- Any failed quota reservations introduced during diagnosis are compensated.
