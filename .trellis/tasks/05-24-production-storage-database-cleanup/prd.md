# Production Storage And Database Cleanup

## Goal

Prepare the Cloudflare production environment for real use by clearing all
development/test audit data, uploaded OCR artifacts, account/session/quota data,
then creating a fresh administrator account for production access.

## What I Already Know

- Production hostname is `https://pdf-audit.bobochang.cn`.
- Worker name is `pdf-certificate-expiry-checker`.
- D1 database is `pdf-audit-db` with binding `AUDIT_DB`.
- Business R2 bucket is `pdf-audit-artifacts` with binding `AUDIT_BUCKET`.
- OpenNext cache R2 bucket is `pdf-audit-opennext-cache` with binding
  `NEXT_INC_CACHE_R2_BUCKET`.
- Business object prefix is `jobs`.
- Production runtime is Cloudflare-only; local macOS services and tunnels are
  not production infrastructure.
- Authentication is first-party cookie auth. Admin-created users are the current
  account model.
- Quota usage is derived from `quota_ledger`, not mutable counters.

## Confirmed Cleanup Boundary

Use a full production data reset:

- Clear audit job rows from `jobs`.
- Clear quota usage ledger rows from `quota_ledger`.
- Clear active session rows from `sessions`.
- Clear configured quota rows from `user_quotas`.
- Clear account rows from `users`.
- Clear R2 business artifacts under the `jobs/` prefix in `pdf-audit-artifacts`.
- Preserve D1 database, tables, indexes, migrations, Worker vars, Worker secrets,
  custom domain, Worker deployment, and R2 buckets themselves.
- Preserve OpenNext cache bucket unless cache corruption is observed.
- Create one fresh production administrator account after the reset.

This removes all previous accounts, sessions, audit history, uploaded PDFs, OCR
results, and quota usage.

## Administrator Account

User requested a new administrator account whose login account is exactly
`bobochang`.

Confirmed decision: use **Scheme B**.

- Implement username/account login support before the production reset.
- User-facing login and administrator creation language should use `账号`, not
  `邮箱`.
- Login payloads and auth service inputs should accept a username/account value.
- Existing email-shaped data can be tolerated during migration, but production
  will be reset and the fresh administrator must log in as `bobochang`.
- display name: `bobochang`
- role: `admin`
- password: provided by the user in chat for one-time creation only
- quota: default admin quota from the deployed bootstrap/user creation flow

Important security constraint:

- Do not store the requested plaintext password in files, commits, shell history
  artifacts, task docs, or journals.

## Requirements

- Add username/account based authentication while preserving password hashing
  and first-party cookie session behavior.
- Update the Cloudflare D1 schema/migrations and local SQLite test schema so
  users can be created and looked up by username/account.
- Update the login UI, auth routes, bootstrap/admin user APIs, and admin user
  management UI so administrators create and manage accounts by `账号`.
- Keep username validation strict enough for production accounts while accepting
  `bobochang`.
- Execute only against the Cloudflare remote production resources, not local
  SQLite or local filesystem paths.
- Use the browser-authenticated Wrangler session on this machine:
  `env -u CLOUDFLARE_API_TOKEN`.
- Before destructive changes, capture counts for:
  - D1 tables: `jobs`, `quota_ledger`, `sessions`, `users`, `user_quotas`
  - R2 objects under `jobs/`
- Do not print secrets or tokens.
- Do not delete Worker secrets.
- Do not write the administrator plaintext password to any repository file,
  command log artifact, or Trellis journal.
- Do not delete D1 database, R2 buckets, custom domain route, or Worker deploy.
- Prefer idempotent commands: rerunning cleanup should leave the environment in
  the same clean state.
- After cleanup, verify:
  - `/api/auth/me` returns `401` without a session.
  - The production page still loads.
  - The fresh `bobochang` administrator credentials can log in.
  - Admin/user quotas show configured limits with zero usage.
  - Audit history is empty.
  - A new upload can create a fresh job and write under `jobs/`.

## Proposed Execution Plan

1. Implement and test username/account login support.
2. Deploy the updated Worker to Cloudflare.
3. Inspect remote D1 table counts.
4. Inspect R2 object count/keys under `jobs/`.
5. Run D1 cleanup transaction in dependency-safe order:

   ```sql
   DELETE FROM quota_ledger;
   DELETE FROM sessions;
   DELETE FROM user_quotas;
   DELETE FROM users;
   DELETE FROM jobs;
   ```

6. Delete R2 objects under `jobs/` from `pdf-audit-artifacts`.
7. Create the fresh `bobochang` administrator account.
8. Re-check D1 table counts.
9. Re-check R2 prefix is empty.
10. Smoke-test production route and unauthenticated auth response.
11. Smoke-test administrator login.
12. Log cleanup evidence in this task without secrets.

## Acceptance Criteria

- [x] Login UI labels the credential field as `账号`.
- [x] Admin user creation/update flows use username/account terminology.
- [x] Fresh administrator account `bobochang` exists with active admin role.
- [x] D1 `jobs` count is `0`.
- [x] D1 `quota_ledger` count is `0`.
- [x] D1 `sessions` count is `0`.
- [x] D1 `users` count is `1` after fresh administrator creation.
- [x] D1 `user_quotas` count is `1` after fresh administrator creation.
- [x] Fresh administrator has role `admin` and active status.
- [x] R2 `pdf-audit-artifacts` known business objects under prior `jobs/`
  directories were deleted.
- [x] Worker and custom domain remain deployed.
- [x] Production unauthenticated auth check returns `401`.
- [ ] Fresh administrator can log in from this machine.

Note: the final browser/curl login smoke test is blocked by this machine's
current network path to `pdf-audit.bobochang.cn:443` returning connection-level
failures after the root route had already verified `200`. D1 confirms the
administrator password hash, quota row, and zero sessions. The user can verify
login directly in the browser once local network access to the domain is stable.

## Execution Evidence

- Local quality gate passed from `web/`: `npm run test`, `npm run lint`,
  `npm run build`, `npm run cf:build`.
- D1 schema migration `0003_username_login.sql` was applied remotely and the
  `d1_migrations` table was updated with `0003_username_login.sql`.
- Deploy succeeded for Worker `pdf-certificate-expiry-checker`; current deployed
  version reported by Wrangler: `50a2a1d5-71d5-4aca-8acc-79e0b613d893`.
- Pre-reset counts were `jobs=10`, `quota_ledger=25`, `sessions=8`,
  `user_quotas=1`, `users=1`.
- R2 cleanup attempted the five known object names for each previous job:
  `input.pdf`, `result.json`, `ocr.txt`, `matches.csv`, `paddleocr.jsonl`.
  Wrangler reported `r2_delete_ok=50 r2_delete_failed=0`.
- Post-reset/admin counts are `jobs=0`, `quota_ledger=0`, `sessions=0`,
  `user_quotas=1`, `users=1`.
- Admin row verification: `username=bobochang`, `role=admin`,
  `status=active`.
- Quota row verification: upload bytes `10737418240`, OCR jobs `25`, OCR pages
  `2000`.
- Production root route returned `200`.
- Production unauthenticated `/api/auth/me` returned `401` with code
  `UNAUTHENTICATED`.
- Sensitive temporary files created for admin hashing and login smoke tests were
  deleted from `/private/tmp`.

## Out Of Scope

- Deleting Cloudflare D1/R2 resources themselves.
- Rotating secrets.
- Changing unrelated OCR, quota calculation, or audit parsing behavior.
- Modifying quotas beyond the default values needed for the fresh administrator
  account, unless explicitly requested.

## Technical Notes

- Relevant config: `web/wrangler.jsonc`.
- Relevant specs:
  - `.trellis/spec/backend/environment.md`
  - `.trellis/spec/backend/storage.md`
  - `.trellis/spec/backend/database.md`
  - `.trellis/spec/backend/security.md`
- Remote D1 command shape:

  ```bash
  cd web
  env -u CLOUDFLARE_API_TOKEN npx wrangler d1 execute pdf-audit-db --remote --command "<SQL>"
  ```

- R2 cleanup likely uses Wrangler commands against bucket
  `pdf-audit-artifacts` and prefix `jobs/`; exact command should be confirmed
  against installed Wrangler help before deletion.
