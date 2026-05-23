# Backend Type Safety Guidelines

> Type patterns for Next.js API routes, D1/SQLite drivers, R2, and PaddleOCR.

---

## Project Types

Keep reusable domain types in `web/src/lib/`:

| Type area | File |
| --- | --- |
| Audit jobs/results | `web/src/lib/audit-types.ts` |
| Auth users/sessions/quotas | `web/src/lib/auth-types.ts` |
| PaddleOCR provider snapshots | `web/src/lib/paddleocr.ts` |
| Object store config and payloads | `web/src/lib/cloud-object-store.ts` |
| D1-like binding interfaces | `web/src/lib/cloudflare-env.ts` |

Route-local request/response helpers can stay in route files when they are not
reused.

## API Handler Signatures

Use standard Next.js route handlers:

```ts
export const runtime = "nodejs"

export async function POST(request: Request) {
  // ...
}
```

For dynamic segments, await `params` in the current Next.js convention used by
the codebase:

```ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
}
```

## Runtime Validation

This project currently uses explicit manual validation and type guards rather
than Zod. Preserve that style unless a task explicitly adopts a schema library.

Examples:

- `validateCreateUserInput` and `normalizeQuota` in `web/src/lib/auth.ts`
- `validateCloudUploadInput` and `assertSafeObjectKey` in
  `web/src/lib/cloud-object-store.ts`
- `parsePaddleOcrJobSnapshot`, `readObject`, and `readNullableNumber` in
  `web/src/lib/paddleocr.ts`

Rules:

- Validate request bodies before side effects.
- Validate object keys before R2 reads/writes.
- Validate provider payloads before storing or exposing derived values.
- Convert provider `401` failures to an `AppError` with a useful stable code
  where available.

## D1 And SQLite Rows

D1 returns plain records. SQLite fallback returns local records. Convert both
through driver methods before returning domain types.

- Keep row-to-domain conversion inside DB driver modules.
- Use literal union checks for roles, statuses, quota resources, and audit
  statuses.
- Prefer `unknown` for untrusted database/provider data until narrowed.
- Avoid scattering type assertions through route handlers.

## No Non-Null Assertions

Never use `!` to bypass nullability. Narrow first:

```ts
const job = await db.getJob(id)
if (!job) {
  return NextResponse.json({ error: "任务不存在" }, { status: 404 })
}
```

## Timestamps

The current API contract uses ISO timestamp strings for jobs, users, sessions,
and quota ledger entries. Keep these as strings unless a specific type declares
milliseconds as a number.

Use `new Date(...).toISOString()` at persistence/service boundaries; do not mix
Unix seconds into API payloads.

## Do Not Use

- Do not add Hono context types or `c.req.header()` patterns.
- Do not add Drizzle row types for the current D1 drivers.
- Do not require Zod schemas for every route until the dependency is adopted.
- Do not expose Cloudflare binding objects or provider response payloads directly
  to the frontend.
