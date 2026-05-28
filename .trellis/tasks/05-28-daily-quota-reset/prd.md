# Fix daily quota reset

## Goal

Users should regain their daily PDF upload and OCR quota on the next day. The current quota snapshot sums the full `quota_ledger` history, so usage from previous days continues to reduce the next day's remaining quota.

## What I Already Know

- Quota usage is derived from append-only `quota_ledger` rows in both D1 and SQLite drivers.
- `AuthDb.getQuotaSnapshot(userId)` currently sums all ledger rows for the user without a date window.
- Upload bytes are reserved when a cloud upload session is created.
- OCR job quota is consumed when a PaddleOCR submission is made.
- OCR page quota is consumed from the provider page count.
- Existing quota limits include PaddleOCR daily page terminology, but the stored `user_quotas.period` currently maps only to `"lifetime"`.

## Requirements

- Treat PDF upload bytes, OCR job count, and OCR page count as daily usage for quota enforcement.
- A user's quota snapshot should include only ledger usage from the current UTC day.
- Usage from previous UTC days must not reduce today's remaining quota.
- Keep the existing append-only ledger model; do not mutate or delete historical rows.
- Keep D1 and SQLite fallback behavior aligned.
- Preserve idempotent per-job retry/refund accounting.

## Acceptance Criteria

- [ ] `getQuotaSnapshot` excludes previous-day quota ledger entries for both D1 and SQLite.
- [ ] `ensureUserQuotaAvailable` allows a new upload/OCR action on the next UTC day when today's usage is below the configured limit.
- [ ] Same-day reserve/consume/refund behavior remains unchanged.
- [ ] Unit tests cover daily reset behavior.
- [ ] Lint, tests, build, and Cloudflare build pass or any failures are clearly reported.

## Definition of Done

- Tests added or updated for daily quota reset.
- Backend quota/database specs updated if the accounting contract changes.
- No secrets or sensitive account data are printed.
- Rollout notes mention that this is a behavior change in quota windowing, not a destructive migration.

## Out of Scope

- Adding Cloudflare Cron or a separate scheduled reset job.
- Changing the admin quota UI.
- Deleting old ledger rows.
- Changing PaddleOCR provider limits.

## Technical Notes

- Relevant files:
  - `web/src/lib/auth-db-d1.ts`
  - `web/src/lib/auth-db-sqlite.ts`
  - `web/src/lib/auth-db.ts`
  - `web/src/lib/quota.ts`
  - `web/src/lib/__tests__/quota.test.ts`
- Relevant specs:
  - `.trellis/spec/backend/database.md`
  - `.trellis/spec/backend/security.md`
  - `.trellis/spec/shared/timestamp.md`
- Recommended implementation:
  - Add a shared UTC-day window helper for quota snapshots.
  - Filter `quota_ledger.created_at >= dayStart AND created_at < dayEnd` when computing snapshot usage.
  - Keep `getJobLedgerAmount(...)` unwindowed so per-job idempotency still sees historical job rows.
