# Frontend Type Safety Guidelines

> TypeScript conventions for Next.js client/server components and API payloads.

---

## Import Project Types

Prefer shared project types from `web/src/lib/` instead of redefining response
shapes in multiple components.

Reference imports:

```ts
import type { AuditHistoryJob, AuditResult, AuditSummary } from "@/lib/audit-types"
import type { PublicUser } from "@/lib/auth-types"
import type { StageState } from "@/lib/audit-python"
```

Small route-local payload wrappers are acceptable in components when they add an
optional `error` field around shared domain types:

```ts
type ResultPayload = {
  job: AuditHistoryJob
  result: AuditResult
  error?: string
}
```

## Fetch Response Typing

`response.json()` should be treated as unknown. Cast to an explicit payload type
after using a safe fallback.

```ts
const payload = (await response.json().catch(() => ({ error: "读取结果失败" }))) as ResultPayload
```

Rules:

- Include `error?: string` on payload types that are read after a non-OK
  response.
- Do not access nested response data before checking `response.ok` when the
  server may return an error payload.
- Use `cache: "no-store"` for mutable auth/job/admin data.

## Nullability

- Use `T | null` for state that is intentionally absent, such as selected rows,
  current jobs, results, stages, and loading IDs.
- Avoid non-null assertions.
- Narrow before use, especially for `fileInputRef.current?.files?.[0]`,
  `selected`, and optional audit row fields.

```tsx
if (!result) {
  return <div>等待检查结果</div>
}
```

## Component Props

Props should be typed inline for small components and with named types when the
shape is reused.

```tsx
function QuotaLine({
  label,
  usedLabel,
  limitLabel,
  percent,
}: {
  label: string
  usedLabel: string
  limitLabel: string
  percent: number
}) {
  // ...
}
```

## Form Values

Browser form inputs are strings. Keep edit state as strings and convert at the
API boundary.

Reference:

- `CreateFormState` and `UserEditState` in
  `web/src/components/audit/admin-user-panel.tsx`
- `formToQuota`, `editToQuota`, and `numberFromInput`

Do not store partially typed numeric input as `number` while the user is editing
it; it makes empty fields and intermediate values harder to represent.

## Timestamps

The current API uses ISO timestamp strings in job and auth records:

- `AuditHistoryJob.createdAt`
- `AuditHistoryJob.updatedAt`
- `AuditHistoryJob.completedAt`
- auth session/user timestamps

Format timestamps for display in UI components. Do not assume Unix
milliseconds unless a specific type says `number`.
