# Timestamp Specification

> Current project rule: persisted and API timestamps are ISO 8601 strings unless
> a type explicitly says the value is a number.

---

## Current Contract

The production app uses D1 plus local SQLite fallback drivers, not Drizzle. The
current domain types expose timestamps as strings:

- `AuditHistoryJob.createdAt`
- `AuditHistoryJob.updatedAt`
- `AuditHistoryJob.completedAt`
- auth user/session timestamps
- quota ledger timestamps
- PaddleOCR provider `startTime` / `endTime` when present

Use ISO strings such as:

```ts
const createdAt = new Date().toISOString()
```

## Database Boundary

Drivers should normalize timestamps before returning domain objects:

- D1 driver: `web/src/lib/audit-db-d1.ts`, `web/src/lib/auth-db-d1.ts`
- SQLite fallback: `web/src/lib/audit-db-sqlite.ts`,
  `web/src/lib/auth-db-sqlite.ts`

Keep conversion inside the driver/service layer. UI components should receive
typed strings and format them for display.

## API Boundary

API route responses should preserve the typed shape from `web/src/lib/*-types.ts`.
Do not convert job/user timestamps to Unix seconds or milliseconds in route
handlers unless the response type is changed in the same task.

Example:

```ts
return NextResponse.json({ jobs })
```

## Numeric Time Values

Numeric time values are still appropriate for durations, limits, and progress:

- `SESSION_TTL_MS`
- PaddleOCR polling interval milliseconds
- upload/download URL expiry seconds
- quota byte counts

Name numeric values with units (`Ms`, `Seconds`, `Bytes`) where possible.

## UI Formatting

Format timestamps at the display edge. Keep raw domain values intact for sorting,
comparison, and API round-trips.

```ts
const label = new Date(job.createdAt).toLocaleString("zh-CN")
```

## Do Not Use

- Do not add Drizzle `timestamp_ms` examples for this project.
- Do not mix Unix seconds with ISO strings in API payloads.
- Do not assume every numeric field is a timestamp; quotas and sizes are numeric
  too.
- Do not make PaddleOCR provider timestamps authoritative for local job
  lifecycle unless explicitly mapped by the service layer.
