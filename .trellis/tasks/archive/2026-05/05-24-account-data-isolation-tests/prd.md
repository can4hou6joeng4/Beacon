# test: account data isolation

## Goal

Add automated regression coverage that proves normal user accounts cannot access or mutate each other's audit jobs, artifacts, OCR submission flow, reanalysis flow, or quota ownership. This task turns the current application-layer isolation contract into executable tests before future API work expands the surface area.

## Requirements

- Preserve the current production security model: normal users are isolated by `jobs.user_id`; admins are the explicit cross-user exception.
- Cover ordinary user cross-account access for job history, result, status, download, reanalysis, upload, and PaddleOCR submission boundaries where practical.
- Cover the critical object-key mismatch case: a user must not be able to submit their own job with another job's R2 `objectKey`.
- Cover quota/accounting ownership for OCR job/page consumption where the flow accepts an explicit job owner.
- Do not change production behavior unless a test exposes a real isolation gap.
- Leave the unrelated active Trellis task directories untouched.

## Acceptance Criteria

- [x] DB/service tests prove normal users cannot list or load another user's jobs while admins can.
- [x] Tests prove object-key/job mismatches are rejected before provider submission.
- [x] Tests prove reanalysis/artifact access cannot cross user ownership boundaries.
- [x] Tests prove quota ledger operations remain scoped to the intended user/job owner.
- [x] If route handlers are practical to test directly, at least the highest-risk API boundaries are covered at route level.
- [x] `npm run test`, `npm run lint`, `npm run build`, and `npm run cf:build` pass.
- [x] Specs are updated if the task codifies new route-level isolation testing conventions.

## Definition of Done

- New or extended tests live under `web/src/lib/__tests__/` or a suitable API test location.
- No new dependencies are introduced.
- No secrets, tokens, PDFs, local DBs, or generated build artifacts are committed.
- A single focused work commit is created after verification.

## Technical Approach

1. Inspect existing isolation-adjacent tests and helper patterns:
   - `web/src/lib/__tests__/audit-db.test.ts`
   - `web/src/lib/__tests__/audit-reanalysis.test.ts`
   - `web/src/lib/__tests__/quota.test.ts`
   - auth DB tests if session/user fixtures are needed.
2. Prefer focused service/lib tests first because the current codebase already exposes database, object storage, quota, and reanalysis helpers.
3. Add route-level tests only if they can be built without broad mocking or brittle Next.js internals.
4. If route-level testing is too expensive, codify the same boundary through the shared service contracts that each route uses:
   - `AuditDb.getJobForUser(...)`
   - object key equality checks before PaddleOCR submission
   - `reanalyzePaddleOcrJobArtifacts(...)`
   - quota ledger owner/user-id behavior.
5. Update backend security/API spec if the new tests establish a durable convention.

## Out of Scope

- Introducing organization/workspace/team tenancy.
- Changing R2 object key shape to include user ids.
- Changing admin global visibility.
- Deploying Cloudflare, unless production code changes are required.
- Archiving or cleaning up `05-24-history-reanalysis-action` or `05-24-paddleocr-parsing-progress-ui`.

## Technical Notes

- Current D1 driver uses `SELECT * FROM jobs WHERE id = ? AND user_id = ?` for normal users in `getJobForUser`.
- Admin role intentionally bypasses user filtering in `getJobForUser`.
- R2 artifacts are authorized by D1 job ownership before deriving sibling object keys.
- Existing `audit-db.test.ts` already has a basic user/admin ownership test; this task should extend coverage toward object storage, reanalysis, quota, and provider-submit mismatch cases.
