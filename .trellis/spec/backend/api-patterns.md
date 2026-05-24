# API Patterns

> Common Next.js API route patterns for the audit service.

---

## Route Skeleton

```ts
import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAuth } from "@/lib/auth"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const context = await requireAuth(request)
    const body = (await request.json().catch(() => null)) as unknown
    // validate body before side effects
    return NextResponse.json({ userId: context.user.id })
  } catch (error) {
    return jsonError(error, "操作失败")
  }
}
```

Rules:

- Set `runtime = "nodejs"` for routes that use the current OpenNext/Cloudflare
  runtime helpers.
- Import server helpers through `@/lib/...`.
- Catch unknown errors with `jsonError`.
- Return compact JSON payloads.
- Hot path API routes may add `Server-Timing` headers through
  `createServerTimingTracker()` and `responseWithServerTiming(...)`. Timing
  names must describe internal stages without exposing secrets, signed URLs, or
  raw provider payloads.

## Body Parsing

Use explicit parsing and validation:

```ts
const payload = (await request.json().catch(() => null)) as {
  jobId?: string
  objectKey?: string
} | null

if (!payload?.jobId) {
  return NextResponse.json({ error: "缺少任务 ID" }, { status: 400 })
}
```

Do not pass unvalidated request bodies to D1, R2, or PaddleOCR helpers.

## Auth And Ownership

Authenticate before loading sensitive data:

```ts
const context = await requireAuth(request)
const db = await getAuditDb()
const job = await db.getJobForUser(id, context.user.id)
if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 })
```

Admin routes must use `requireAdmin(request)`.

## Cloud Upload Pattern

For PDF upload flows:

1. Validate filename/size/type/cutoff.
2. Create or validate object key through `cloud-object-store.ts`.
3. Reserve upload quota before upload work.
4. Create/update the D1 job row.
5. Return only the upload information the browser needs.
6. On provider submission, verify the job ID and object key match the stored job.

## PaddleOCR Pattern

Use provider helpers in `web/src/lib/paddleocr.ts`:

- `submitPaddleOcrFileJob`
- `fetchPaddleOcrJobSnapshot`
- `parsePaddleOcrJsonlMarkdown`
- `paddleOcrMarkdownPagesToOcrText`

Provider tokens are server-only. Never send `PADDLEOCR_API_TOKEN` or full
provider response payloads to the browser.

## Retired Local Endpoints

The old local upload/OCR endpoints intentionally return `410`. Keep them as
compatibility signals for clients, but do not build new production behavior on
top of them.

## Do Not Use

- Do not use Hono middleware/procedure examples.
- Do not introduce Zod schemas as a requirement without adding the dependency and
  updating the project pattern.
- Do not return inconsistent secrets or raw storage/provider internals.
