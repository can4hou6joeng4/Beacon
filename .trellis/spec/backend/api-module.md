# API Module Organization

> Project-specific backend API layout for the `web/` Next.js 16 App Router app
> deployed through OpenNext to Cloudflare Workers.

---

## Production Stack

This project does **not** use Hono routers or a standalone Worker entrypoint for
the production app. API endpoints are Next.js App Router route handlers under
`web/src/app/api/**/route.ts`. OpenNext compiles those route handlers into the
Cloudflare Worker configured by `web/wrangler.jsonc`.

The production API surface coordinates:

- first-party account auth and admin-only user creation,
- append-only quota ledger accounting,
- Cloudflare D1 history/auth storage,
- Cloudflare R2 PDF/artifact object storage,
- PaddleOCR async job submission and polling.

The previous root-level Python/Swift/local web runtime has been removed from
source control. Retired local API routes may still return `410` compatibility
responses, but new production behavior must use the Cloudflare/PaddleOCR path.

## Directory Structure

```text
web/src/app/api/
├── admin/users/route.ts
├── admin/users/[id]/route.ts
├── auth/bootstrap/route.ts
├── auth/login/route.ts
├── auth/logout/route.ts
├── auth/me/route.ts
├── audit/cloud-uploads/route.ts
├── audit/cloud-uploads/[jobId]/file/route.ts
├── audit/cloud-uploads/paddleocr/route.ts
├── audit/history/route.ts
└── audit/jobs/[id]/{status,result,download/[file]}/route.ts

web/src/lib/
├── api-response.ts          # shared JSON error helper
├── app-error.ts             # structured AppError
├── audit-*.ts               # audit DB, types, analysis, job status helpers
├── auth-*.ts                # auth DB, crypto, types, service
├── cloud-object-store.ts    # R2 binding + S3 compatibility helpers
├── cloudflare-env.ts        # Cloudflare binding/runtime helpers
├── paddleocr*.ts            # PaddleOCR config, client, runtime env
└── quota*.ts                # quota ledger service + external limits
```

## Route Handler Pattern

Route files should stay thin. They authenticate, parse input, call services in
`web/src/lib/`, and return `NextResponse`.

```typescript
import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAdmin } from "@/lib/auth"
import { getAuthDb } from "@/lib/auth-db"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const db = await getAuthDb()
    const users = await db.listUsers()
    return NextResponse.json({ users })
  } catch (error) {
    return jsonError(error, "读取用户列表失败")
  }
}
```

Rules:

- Export `runtime = "nodejs"` on API routes. OpenNext/Cloudflare runs them in
  Workers with `nodejs_compat`.
- Use same-origin relative URLs from the client (`/api/...`).
- Use `jsonError(error, fallbackMessage)` for route-level catches.
- Keep provider tokens, R2 object bytes, and raw session tokens out of response
  payloads.
- Validate request body fields before creating jobs, reserving quota, or writing
  objects.

## Service Boundary

Put reusable business logic in `web/src/lib/`, not in route files.

| Concern | Service file |
| --- | --- |
| login, bootstrap, require session/admin | `auth.ts` |
| auth/user/quota persistence | `auth-db.ts`, `auth-db-d1.ts`, `auth-db-sqlite.ts` |
| audit job persistence | `audit-db.ts`, `audit-db-d1.ts`, `audit-db-sqlite.ts` |
| quota reservations/refunds/consumption | `quota.ts` |
| external quota constants | `quota-limits.ts` |
| R2/S3 object storage | `cloud-object-store.ts` |
| PaddleOCR client and response parsing | `paddleocr.ts`, `paddleocr-runtime.ts` |
| OCR result analysis | `audit-analyzer.ts`, `evidence-text.ts` |

Extract logic when:

- the behavior needs unit tests,
- more than one route calls it,
- it owns a cross-layer invariant such as quota refunds or ownership checks,
- it touches Cloudflare bindings or third-party provider behavior.

## API Response Contract

Success responses are plain JSON objects shaped for the UI:

```typescript
return NextResponse.json({ job })
return NextResponse.json({ user }, { status: 201 })
return NextResponse.json({ result, job, distribution })
```

Errors use `jsonError`, which maps `AppError` status/code into JSON.

Important codes already used in the app:

| Code | Meaning |
| --- | --- |
| `UNAUTHENTICATED` | no valid session cookie |
| `ADMIN_REQUIRED` | non-admin called admin endpoint |
| `QUOTA_EXHAUSTED` | account has no remaining quota |
| `UPLOAD_QUOTA_LIMIT_EXCEEDED` | configured upload limit exceeds R2 baseline |
| `OCR_PAGE_LIMIT_EXCEEDED` | configured OCR pages exceed PaddleOCR limit |
| `PADDLEOCR_UNAUTHORIZED` | provider rejected `PADDLEOCR_API_TOKEN` |

## Cross-Layer Route Flow

### Cloud Upload Flow

1. UI calls `POST /api/audit/cloud-uploads`.
2. Route verifies auth and upload quota, creates a job, reserves upload bytes.
3. In `r2-binding` mode it returns
   `/api/audit/cloud-uploads/{jobId}/file`.
4. Browser `PUT`s the PDF to that same-origin route.
5. Worker validates ownership, PDF type, and exact byte size, then writes to
   `AUDIT_BUCKET`.
6. UI calls `POST /api/audit/cloud-uploads/paddleocr`.
7. Worker reads the private R2 object and submits multipart file mode to
   PaddleOCR.

Never expose a public R2 object URL or a PaddleOCR token to the browser.

### Status/Result Flow

1. UI polls `GET /api/audit/jobs/{id}/status`.
2. Route verifies ownership and provider job id.
3. PaddleOCR status is normalized into `StageState`.
4. When done, result JSONL is analyzed and stored.
5. OCR page quota is consumed idempotently from the final provider page count.

### OCR Result Analysis Contract

`web/src/lib/audit-analyzer.ts` owns validity-field classification and expiry
extraction. Keep these as two related but separate windows:

- Classification may inspect nearby text before and after the focused validity
  marker. PaddleOCR can place `使用有效期` at the top of a certificate page and
  the `中华人民共和国 ... 造价工程师注册证书` heading after the date lines.
- PaddleOCR markdown can omit audit-relevant top-page blocks when they are
  labeled as `header`. The JSONL normalization step must merge ignored
  certificate title and validity blocks from `prunedResult.parsing_res_list`
  before audit analysis.
- Registered cost engineer certificate pages (`一级/二级注册造价师证`) are document
  pages whose business expiry is the document `使用有效期`, not the longer
  registration `有效期` printed in the certificate body. If OCR misses the
  document use-validity field on these pages, emit a `needs_review` row instead
  of silently accepting the body registration date.
- Personnel resume tables are not registered cost engineer certificate document
  pages merely because a cell such as `注册执业证书名称` contains `一级注册造价师证`.
  Only emit missing-use-validity review rows when the surrounding text also
  looks like an actual certificate document page.
- Treat common OCR variants of the document use-validity label as the same
  field, including missing `有` forms such as `史用效期` or `更用效期`.
- Field extraction should stay focused on the validity field itself. It should
  stop before certificate headings, registration records, approval dates, issue
  dates, proof dates, or the next validity marker so unrelated document dates do
  not override the expiry.
- Match classification uses an inclusive cutoff: an expiry date equal to the
  selected cutoff date is already expired for audit purposes and belongs in
  `matches`, not `near_expiry`.
- Non-certificate form markers such as `项目评审结论表` still block the focused
  validity field unless a certificate marker appears closer on the same side of
  the field.

Required tests for analyzer changes:

- leading `使用有效期` before the certificate heading;
- expiry date equality with the cutoff date;
- split range dates where the end date is on the next OCR/Markdown line;
- OCR-misread `使用有效期` labels with the second date on the following line and
  no dash between range dates;
- missing use-validity review rows for registered cost engineer certificates;
- image or HTML markup between the date and later certificate heading;
- review-form validity rows remain ignored on mixed pages.

## Wrong vs Correct

### Wrong

```typescript
// Fat route handler owns parsing, provider calls, database writes, and refunds.
export async function POST(request: Request) {
  const body = await request.json()
  await fetch("https://paddleocr...", { body: JSON.stringify(body) })
  // no ownership or quota refund boundary
}
```

### Correct

```typescript
export async function POST(request: Request) {
  try {
    const context = await requireAuth(request)
    const input = parseSubmitInput(await request.json())
    await consumeOcrJobQuota({ context, jobId: input.jobId })
    const providerJobId = await submitPrivateR2ObjectToPaddleOcr(input)
    return NextResponse.json({ providerJobId })
  } catch (error) {
    return jsonError(error, "提交云端 OCR 任务失败")
  }
}
```
