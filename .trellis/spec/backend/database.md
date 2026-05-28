# Database Guidelines

> Project-specific persistence conventions for Cloudflare D1 in production and
> SQLite in local/test fallback.

---

## Production Persistence Contract

Production uses the Cloudflare D1 binding `AUDIT_DB`, configured in
`web/wrangler.jsonc`.

```jsonc
"d1_databases": [
  {
    "binding": "AUDIT_DB",
    "database_name": "pdf-audit-db",
    "migrations_dir": "migrations"
  }
]
```

The current codebase intentionally does **not** use Drizzle or libSQL. Keep the
two driver implementations aligned manually:

- `web/src/lib/audit-db-d1.ts`
- `web/src/lib/audit-db-sqlite.ts`
- `web/src/lib/auth-db-d1.ts`
- `web/src/lib/auth-db-sqlite.ts`

`web/src/lib/audit-db.ts` and `web/src/lib/auth-db.ts` select the driver.

## Driver Selection

- Production: `AUDIT_DB_DRIVER=d1`.
- Production binding access goes through `getCloudflareD1Binding()`.
- Local/test fallback uses `better-sqlite3` and `AUDIT_DB_PATH`.
- Do not add a third database path without updating both auth and audit driver
  contracts.

## Tables and Responsibilities

| Table | Owner | Purpose |
| --- | --- | --- |
| `jobs` | audit DB | audit job lifecycle, result summaries, object keys, ownership |
| `users` | auth DB | first-party account records |
| `sessions` | auth DB | hashed session tokens and expiry |
| `user_quotas` | auth DB | configured quota limits |
| `quota_ledger` | auth DB | append-only quota reserve/consume/refund/adjust entries |

Job ownership is enforced through `jobs.user_id`. Admins may list/read across
users; normal users may only access their own jobs.

## Schema Migration Pattern

The local SQLite drivers create tables and use `addColumnIfMissing(...)` for
small additive migrations. D1 drivers assume remote schema has the same columns.

When adding a persisted field:

1. Update both SQLite and D1 row types.
2. Update both SQLite and D1 insert/update/select mappings.
3. Add the column in the SQLite `ensureSchema` path.
4. Apply the matching D1 schema change remotely with Wrangler.
5. Add or update tests under `web/src/lib/__tests__/`.

For production D1 migrations, keep the remote `d1_migrations` table in sync with
the migration files. If an emergency/manual `d1 execute --remote` applies a
schema file outside `wrangler d1 migrations apply`, insert the matching migration
record after verifying the schema so future migration runs do not attempt to
repeat an `ALTER TABLE`.

## Auth User Schema Contract

### 1. Scope / Trigger

- Trigger: auth user rows are read by login, session context, admin lists, and
  quota ownership paths.

### 2. Signatures

- `users.username TEXT UNIQUE` is the canonical login account column.
- `users.email TEXT NOT NULL UNIQUE` may remain as compatibility metadata in the
  current D1 schema.
- `AuthDb.getUserByLogin(login)` should search username first and tolerate
  legacy email-shaped login values.

### 3. Contracts

- New users must have a normalized username.
- D1 and SQLite drivers must both insert/select/map `username`.
- `AppUser` and `PublicUser` include `username`.
- If no email is supplied, drivers may write `{username}@local.invalid` to
  satisfy legacy `email NOT NULL` constraints.

### 4. Validation & Error Matrix

| Condition | Error |
| --- | --- |
| Duplicate username/email unique constraint | service maps to `409 USER_EXISTS` |
| Missing remote `username` column after deploy | D1 insert/login fail; apply migration before deploy use |
| Manual migration applied but not recorded | future migration apply may fail on duplicate column |

### 5. Good/Base/Bad Cases

- Good: D1 table has `username`, `idx_users_username`, and matching
  `d1_migrations` row.
- Base: existing email users map to fallback usernames until reset/migration.
- Bad: UI sends only `email` for newly created accounts.

### 6. Tests Required

- SQLite auth DB tests cover username insert, lookup, and mapped public user.
- Service tests cover invalid username rejection.
- Build and Cloudflare build must pass after schema type updates.

### 7. Wrong vs Correct

#### Wrong

```sql
ALTER TABLE users ADD COLUMN username TEXT;
-- forgot d1_migrations when applied manually
```

#### Correct

```sql
ALTER TABLE users ADD COLUMN username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
INSERT INTO d1_migrations (id, name, applied_at)
VALUES (3, '0003_username_login.sql', datetime('now'));
```

## Query Patterns

Use prepared SQL with bound parameters. Do not interpolate user-controlled
values into SQL strings.

D1:

```typescript
await d1.prepare("SELECT * FROM jobs WHERE id = ? AND user_id = ?")
  .bind(jobId, userId)
  .first<JobRow>()
```

SQLite:

```typescript
db.prepare("SELECT * FROM jobs WHERE id = ? AND user_id = ?")
  .get(jobId, userId) as JobRow | undefined
```

Rules:

- Use deterministic ordering for list endpoints, usually `ORDER BY created_at
  DESC`.
- User-scoped job history queries must have a matching compound index:
  `idx_jobs_user_created_id ON jobs(user_id, created_at DESC, id DESC)`.
- Global job history queries should keep `idx_jobs_created_id ON jobs(created_at
  DESC, id DESC)` for deterministic list performance.
- Keep row-to-domain mapping in small `map*` helpers.
- Convert nullable numeric SQL fields with `Number(row?.field ?? 0)`.
- Use ISO timestamps for persisted date strings.
- Avoid `await` in loops for independent reads/writes; batch or parallelize
  when practical.

## Quota Ledger Contract

Quota usage is derived from `quota_ledger`, not from mutable counters. The
current app treats upload bytes, OCR job count, and OCR page count as daily
resources: quota snapshots and enforcement count ledger rows in the current UTC
day window only. Historical rows stay in the append-only ledger for audit and
per-job idempotency.

| Action | Sign |
| --- | --- |
| `reserve` | positive usage |
| `consume` | positive usage |
| `refund` | negative usage |
| `adjust` | ignored by usage totals unless explicitly queried for audit |

Important invariants:

- Upload bytes are reserved when a cloud upload session is created.
- Failed object upload refunds upload bytes once.
- OCR job quota is consumed when PaddleOCR submission succeeds, and refunded
  once if submission fails.
- OCR page quota is consumed idempotently from the final provider extracted page
  count.

Use `getJobLedgerAmount(...)` to make retry/refund paths idempotent.
`getJobLedgerAmount(...)` intentionally remains job-scoped rather than
day-windowed so retries can still see previous ledger rows for the same job.

## Tests Required

Database changes require tests for both the behavior and the accounting math.
Existing examples:

- `web/src/lib/__tests__/audit-db.test.ts`
- `web/src/lib/__tests__/auth-db.test.ts`
- `web/src/lib/__tests__/quota.test.ts`

For production fixes involving D1, also run a focused remote query with:

```bash
cd web
env -u CLOUDFLARE_API_TOKEN npx wrangler d1 execute pdf-audit-db --remote --command "<SQL>"
```

Do not print secrets while running smoke tests.

## Wrong vs Correct

### Wrong

```typescript
const row = await d1.prepare(`SELECT * FROM jobs WHERE id = '${jobId}'`).first()
```

### Correct

```typescript
const row = await d1.prepare("SELECT * FROM jobs WHERE id = ?")
  .bind(jobId)
  .first<JobRow>()
```
