# Account Authentication and Usage Quotas

## Goal

Replace the shared URL token gate with a formal account system and add usage
quotas for PDF uploads and OCR parsing resources, so the public Cloudflare
service can support named users while controlling storage and PaddleOCR cost.

## What I Already Know

- The current production runtime is Cloudflare-only:
  - Worker/OpenNext app: `pdf-certificate-expiry-checker`
  - Hostname: `pdf-audit.bobochang.cn`
  - D1 database: `pdf-audit-db`
  - R2 artifacts bucket: `pdf-audit-artifacts`
  - OCR provider: PaddleOCR async API
- Current auth is a shared `PDF_CHECKER_TOKEN` query/cookie gate in:
  - `web/src/middleware.ts`
  - `web/src/lib/audit-auth.ts`
- Final implementation should remove this gate from normal access. Bootstrap
  must use a dedicated `AUTH_BOOTSTRAP_TOKEN` secret only.
- Current D1 schema only stores audit jobs in `web/migrations/0001_init_audit_jobs.sql`.
- Current audit jobs are not owned by users.
- Uploads are created through `POST /api/audit/cloud-uploads`.
- OCR processing is started through `POST /api/audit/cloud-uploads/paddleocr`.
- The user selected formal account system instead of shared token, password page,
  Cloudflare Access, or no auth.
- The user also wants uploaded PDFs and parseable resources to use a quota
  mechanism.

## Research References

- [`research/auth-and-quota-options.md`](research/auth-and-quota-options.md) —
  compares minimal D1 auth, Better Auth, and external identity options.

## Recommendation

Build an MVP first-party account system in D1:

- Email/password login.
- HttpOnly secure session cookie.
- Admin-created users first; no public self-signup in the first pass.
- Per-user quotas stored and enforced in D1.
- Existing shared `PDF_CHECKER_TOKEN` must not be used for normal access or
  bootstrap after this task.

This keeps the system small and explicit, matches the current D1 wrapper style,
and avoids adding an auth framework adapter before the product needs a full
identity suite.

## Requirements

- Replace normal user access to the app with account login.
- Do not expose the command center, history, job status, result, downloads, or
  upload/submit APIs to unauthenticated users.
- Associate every new audit job with a user.
- Scope history/results/downloads so normal users only see their own jobs.
- Add an admin role that can create/disable users and assign quota.
- Add quota tracking for:
  - uploaded PDF bytes,
  - OCR job count,
  - parsed/OCR pages when provider progress or result metadata reveals pages.
- Enforce quota before creating a cloud upload session.
- Enforce quota again before submitting a stored PDF to PaddleOCR, because a
  file may be uploaded but not yet parsed.
- Record quota reservations, consumption, refunds, and admin adjustments in an
  append-only ledger.
- Store no plaintext passwords or session tokens.
- Keep all secrets and bootstrap credentials out of repository files.

## Proposed Data Model

- `users`
  - `id`
  - `email`
  - `name`
  - `role`: `admin` or `user`
  - `password_hash`
  - `password_salt`
  - `password_iterations`
  - `status`: `active` or `disabled`
  - `created_at`
  - `updated_at`
  - `last_login_at`
- `sessions`
  - `id`
  - `user_id`
  - `token_hash`
  - `expires_at`
  - `created_at`
  - `last_seen_at`
  - `user_agent`
- `user_quotas`
  - `user_id`
  - `upload_bytes_limit`
  - `ocr_jobs_limit`
  - `ocr_pages_limit`
  - `period`: initially `lifetime`
  - `updated_at`
- `quota_ledger`
  - `id`
  - `user_id`
  - `job_id`
  - `resource`: `upload_bytes`, `ocr_jobs`, or `ocr_pages`
  - `action`: `reserve`, `consume`, `refund`, `adjust`
  - `amount`
  - `reason`
  - `created_at`
- `jobs`
  - add `user_id`
  - optionally add upload byte/page usage snapshot columns if needed for faster
    display.

## Proposed Quota Behavior

- Upload session creation:
  - Validate requested file size.
  - Check user's remaining upload-byte quota.
  - Reserve upload bytes for that job.
- OCR submission:
  - Check remaining OCR job quota.
  - Consume or reserve one OCR job.
- OCR completion:
  - Determine parsed/OCR page count from PaddleOCR progress/result when
    available.
  - Consume OCR pages.
  - If parsing fails before useful output is produced, refund reserved OCR
    pages/job according to the failure policy.
- Admin adjustments:
  - Admin can increase/decrease quota with `adjust` ledger entries.

## Open Questions

- None currently blocking implementation.

## Assumptions

- Confirmed decision: admin-created users only for the MVP. Do not expose public
  self-registration.
- Quotas are lifetime quotas in the MVP, not monthly reset quotas.
- The first admin can be seeded through a protected admin setup command or an
  endpoint guarded by the `AUTH_BOOTSTRAP_TOKEN` Cloudflare secret.
- Existing historical jobs may remain unowned or be assigned to a system/admin
  user during migration.

## Acceptance Criteria

- [x] A user can sign in with email/password and access the audit command center.
- [x] A user can sign out and their session is invalidated.
- [x] Unauthenticated users are redirected to sign-in or receive `401` JSON for
      API calls.
- [x] Shared URL token is no longer required for normal user operation.
- [x] New jobs are persisted with `user_id`.
- [x] Normal users only see and download their own jobs.
- [x] Admin users can create/disable users and assign quota.
- [x] Upload creation fails with a clear error when upload-byte quota is
      exhausted.
- [x] OCR submission or completion fails/refunds according to the quota policy
      when job/page quota is exhausted.
- [x] Quota ledger rows make usage auditable.
- [x] D1 migrations apply remotely.
- [x] `npm run test`, `npm run lint`, `npm run build`, and `npm run cf:build`
      pass.

## Out of Scope

- Payment integration.
- Multi-tenant organizations.
- Email verification or password reset emails unless required for MVP safety.
- OAuth/social login.
- Monthly billing-grade metering.
- Cloudflare Access.

## Definition of Done

- PRD is confirmed.
- Relevant specs/research are persisted in the task.
- D1 schema and code changes are implemented.
- Cloudflare production deployment is updated.
- Existing cloud upload/PaddleOCR flow works through authenticated user sessions.
- Tests cover auth, ownership, and quota enforcement.
