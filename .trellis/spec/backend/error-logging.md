# Error Handling And Logging

> Error and logging conventions for Next.js API routes on OpenNext Cloudflare.

---

## Error Model

Use `AppError` for expected application failures:

```ts
throw new AppError("当前账号额度不足，请联系管理员调整额度", {
  status: 402,
  code: "QUOTA_EXHAUSTED",
})
```

Reference files:

- `web/src/lib/app-error.ts`
- `web/src/lib/api-response.ts`

Route handlers should catch unknown errors and delegate to `jsonError`:

```ts
import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"

export async function POST(request: Request) {
  try {
    // validate, authorize, mutate
    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(error, "操作失败")
  }
}
```

`jsonError` returns:

- `{ error, code }` with the `AppError.status` for known application errors.
- `{ error }` with status `500` for unexpected errors.

## Expected Status Codes

| Status | Use case |
| --- | --- |
| `400` | Missing/invalid request body, file type, object key, or quota value |
| `401` | Missing/invalid session, invalid login, invalid bootstrap token |
| `402` | Quota exhausted |
| `403` | Authenticated user is not admin |
| `404` | Job/user/object not found |
| `409` | Duplicate user, stale upload state, size mismatch, unsupported mode |
| `410` | Retired local upload/OCR endpoints |
| `503` | Required bootstrap/provider configuration missing |

Keep messages user-readable because the current UI displays `payload.error`
directly.

## Route Pattern

1. Authenticate first when the route is protected.
2. Parse and validate request JSON/form data.
3. Validate quota before starting provider/storage work.
4. Perform side effects.
5. Return a small typed JSON payload.
6. Catch with `jsonError`.

Do not leak raw provider payloads, tokens, signed URLs, or full object bodies in
error responses.

## Logging

There is no project-wide structured logger yet. Until one is introduced:

- Use route responses and stable `AppError.code` values as the primary error
  contract.
- Avoid `console.log` debug noise in production code.
- `console.error` is acceptable for unexpected server-side failures only when it
  does not include secrets or large OCR/PDF payloads.
- Never log passwords, raw session tokens, PaddleOCR tokens, bootstrap tokens,
  R2 secret keys, presigned URLs, or full OCR result blobs.

If a future task adds structured logging, place the helper under
`web/src/lib/`, keep log records JSON-serializable, and add request/job/user IDs
without logging sensitive content.

## Provider Error Handling

PaddleOCR errors should be mapped to user-actionable messages when possible.
Provider `401` means the configured PaddleOCR token is invalid, expired, or lacks
access; return an authenticated server error message without exposing the token.

R2/object-store errors should preserve the operation context in the fallback
message, such as upload session creation, object upload, artifact download, or
unsafe object key.

## Do Not Use

- Do not use Hono `HTTPException` in this Next.js app.
- Do not add a global Hono error handler.
- Do not return stack traces to the browser.
- Do not swallow quota ledger failures after provider work has started; refund
  or surface the failure according to `web/src/lib/quota.ts` patterns.
