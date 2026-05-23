# Account Auth and Quota Options Research

## Sources

- Cloudflare D1 overview: https://developers.cloudflare.com/d1/
- Cloudflare D1 Worker API and batch behavior: https://developers.cloudflare.com/d1/worker-api/d1-database/
- Better Auth introduction: https://www.better-auth.com/docs
- Better Auth Next.js integration: https://better-auth.com/docs/integrations/next
- Better Auth relational database adapters: https://better-auth.com/docs/adapters/other-relational-databases
- Better Auth SQLite adapter: https://better-auth.com/docs/adapters/sqlite
- MDN Web Crypto `deriveBits` and PBKDF2: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits
- MDN PBKDF2 parameters: https://developer.mozilla.org/en-US/docs/Web/API/Pbkdf2Params

## Findings

Cloudflare D1 is already the production database for audit jobs. It is a
serverless SQL database accessed from Workers through bindings. D1 supports
prepared statements and batched statements; batched statements run sequentially
and roll back the whole sequence if one statement fails.

Better Auth is a full TypeScript authentication framework and has first-class
Next.js integration. Its docs recommend mounting an `/api/auth/[...all]` route
and using server-side session checks for protected pages/actions. Better Auth
also warns that cookie-only middleware checks are not security by themselves and
server-side routes must validate sessions.

Better Auth supports many relational databases through Kysely, including
Cloudflare D1 via community Kysely dialect support. That is promising but adds
a new adapter surface to this project. The current app already has a small D1
wrapper and no ORM, so a minimal custom auth layer may be lower risk for the
first production quota pass.

Web Crypto supports PBKDF2 through `crypto.subtle.deriveBits`; PBKDF2 uses a
salt, iteration count, and digest such as SHA-256. This works in secure contexts
and Web Workers, matching the Cloudflare Workers runtime shape.

## Feasible Approaches

### Option A: Minimal first-party auth in D1

- Tables: `users`, `sessions`, `quota_accounts`, `quota_ledger`.
- Password hashing: PBKDF2-SHA-256 with per-user salt and iteration count.
- Sessions: random token in an httpOnly cookie; only hash stored in D1.
- Quotas: ledger rows reserve/consume/refund upload bytes and OCR pages/jobs.
- Admin/user creation: admin-only endpoint or one-time seeded admin.

Fit:
- Best for a narrow single-purpose tool.
- Keeps D1 and route code explicit.
- Avoids adapter/runtime surprises.

Trade-offs:
- We own password reset, invite, and session cleanup.
- Must be careful with security details and tests.

### Option B: Better Auth with D1/Kysely adapter

- Use Better Auth for users/sessions/password auth.
- Add project-specific quota tables and D1 enforcement around audit jobs.

Fit:
- Stronger long-term auth feature set.
- More standard user-management surface if the product grows.

Trade-offs:
- Adds dependency, generated schema, adapter complexity, and runtime
  compatibility validation on OpenNext/Cloudflare Workers.
- Quota logic is still custom.

### Option C: External identity provider plus internal quotas

- Use Cloudflare Access, OAuth, or another identity provider.
- Map provider identity to local quota rows.

Fit:
- Good for organization-managed access.
- Avoids password storage in this app.

Trade-offs:
- User chose formal app accounts, so this is less aligned for the MVP.
- Still requires local quota and user mapping.

## Recommendation

Use Option A for the MVP: minimal first-party email/password accounts in D1,
httpOnly cookie sessions, and a quota ledger enforced at upload-session creation
and OCR submission/completion. Keep the schema straightforward so it can later
be migrated to Better Auth or an identity provider if the product grows.
