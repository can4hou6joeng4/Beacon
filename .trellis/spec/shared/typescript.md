# TypeScript Guidelines

> Shared TypeScript rules for the Next.js/OpenNext Cloudflare app.

---

## Explicit Exported Types

Use explicit return types for exported library functions, especially when the
function crosses a route/service/database boundary.

```ts
export async function getAuthContext(request: Request): Promise<AuthContext | null> {
  // ...
}
```

Inline inference is acceptable for small local helpers inside a component or
test when the type is obvious.

## Type Imports

Use `import type` for type-only imports.

```ts
import type { PublicUser } from "@/lib/auth-types"
import { requireAuth } from "@/lib/auth"
```

## Object Types

Use `type` for most object shapes and unions. Use `interface` only when
declaration merging or extension is genuinely useful.

```ts
type AuditPayload = {
  jobId: string
  error?: string
}
```

## Runtime Validation

The current project uses manual validation and type guards, not a schema
library. Follow existing helpers before adding dependencies:

- `validateCloudUploadInput(...)`
- `assertSafeObjectKey(...)`
- `validateCreateUserInput(...)`
- `parsePaddleOcrJobSnapshot(...)`
- `readObject(...)`

Pattern:

```ts
const payload = (await request.json().catch(() => null)) as {
  jobId?: string
} | null

if (!payload?.jobId) {
  return NextResponse.json({ error: "缺少任务 ID" }, { status: 400 })
}
```

Do not require Zod for new code unless a task explicitly adopts it and updates
the dependency/spec contract.

## Unknown Over Any

Use `unknown` for untrusted provider, database, and JSON values until narrowed.

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
```

Avoid `any` in source and tests.

## Discriminated Unions

Use literal unions for project state:

- `AuditStatusValue`
- `PaddleOcrState`
- `UserRole`
- `UserStatus`
- `QuotaResource`

Use strict equality to narrow.

```ts
if (job.status === "complete") {
  // ...
}
```

## Nullability

Prefer explicit `T | null` when absence is part of the domain. Narrow before
accessing optional values.

Never use non-null assertions.

## Units In Names

Include units in numeric names when the unit matters:

- `pollIntervalMs`
- `uploadExpiresSeconds`
- `downloadExpiresSeconds`
- `uploadBytesLimit`
- `ocrPagesLimit`

## Summary

| Practice | Rule |
| --- | --- |
| Exported functions | Prefer explicit return types |
| Untrusted JSON/provider data | Use `unknown` and narrow |
| Validation | Manual guards matching existing code |
| Type imports | Use `import type` |
| Nullability | Narrow explicitly; no `!` |
| Numeric units | Put units in names |
