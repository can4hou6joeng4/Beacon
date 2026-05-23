# Authentication Guidelines

> Project-specific auth contract for the `web/` Next.js app. This project uses
> first-party cookie sessions, not Better Auth or a third-party auth UI.

---

## Runtime Shape

Authentication is implemented in application code under `web/src/lib/` and
Next.js API routes under `web/src/app/api/`.

Reference files:

| Concern | Path |
| --- | --- |
| Auth service and cookie helpers | `web/src/lib/auth.ts` |
| Password and token hashing | `web/src/lib/auth-crypto.ts` |
| Shared auth types | `web/src/lib/auth-types.ts` |
| D1 auth driver | `web/src/lib/auth-db-d1.ts` |
| SQLite test/local fallback | `web/src/lib/auth-db-sqlite.ts` |
| Login UI | `web/src/components/auth/sign-in-panel.tsx` |
| Auth bootstrap/login/logout/me routes | `web/src/app/api/auth/**/route.ts` |
| Admin user routes | `web/src/app/api/admin/users/**/route.ts` |

Do not add Better Auth, OAuth providers, or a separate auth framework unless a
new task explicitly chooses that migration.

## Session Contract

- Session cookie name: `pdf_audit_session`.
- Cookie attributes come from `cookieOptions(request, maxAge)`.
- Cookies are `HttpOnly`, `SameSite=Lax`, `path=/`, and `secure` on HTTPS or
  production.
- Raw session tokens are returned only at login time so the route handler can set
  the cookie. Store only `hashToken(token)` in D1.
- `getAuthContext(request)` reads the cookie, hashes the token, loads user and
  quota context, and touches the session.
- `requireAuth(request)` protects normal audit APIs.
- `requireAdmin(request)` protects all admin user-management APIs.

Example route guard:

```ts
import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAdmin } from "@/lib/auth"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return jsonError(error, "读取失败")
  }
}
```

## User Creation Rules

- Only administrators can create normal users.
- The one-time bootstrap endpoint may create the first admin only when the users
  table is empty.
- Bootstrap requires `AUTH_BOOTSTRAP_TOKEN` through the `Authorization: Bearer`
  header or request body token. Missing bootstrap token must fail closed with
  `503`.
- Passwords must be at least 10 characters.
- Emails are normalized before lookup or insert.
- Duplicate emails should become `409 USER_EXISTS`, not a generic `500`.

## Password And Token Storage

- Passwords use PBKDF2/SHA-256 through Web Crypto in `auth-crypto.ts`.
- Password records include hash, salt, and iteration count.
- Session tokens use random 32-byte base64url strings.
- Session token hashes use SHA-256 hex strings.
- Never log raw passwords, raw session tokens, PaddleOCR tokens, bootstrap
  tokens, or R2 credentials.

## Frontend Integration

`web/src/app/page.tsx` is the server-side gate:

- It reads `cookies()` and calls `getAuthContextFromCookieHeader`.
- If no valid session exists, render `SignInPanel`.
- If authenticated, render `AuditCommandCenter` with the current user and
  initial history/result payloads.

Client components should call same-origin APIs with relative URLs:

```ts
const response = await fetch("/api/auth/me", { cache: "no-store" })
```

Do not read the session cookie in client code. The cookie is HttpOnly by design.

## Quota-Aware Auth Context

`PublicUser` includes a quota snapshot. User-facing quota displays and admin
quota forms must use the server-provided `currentUser.quota` shape rather than
recomputing usage in the browser.

Quota edits belong in admin routes and `web/src/lib/auth.ts` normalization:

- Upload quota is clamped by Cloudflare R2 free-tier storage assumptions.
- OCR page quota is capped by the PaddleOCR daily page limit.
- Quota ledger mutations happen in `web/src/lib/quota.ts`.

## Error Contract

Auth service code should throw `AppError` with a stable code:

```ts
throw new AppError("请先登录后再使用审计功能", {
  status: 401,
  code: "UNAUTHENTICATED",
})
```

Route handlers must catch unknown errors with `jsonError(error, fallback)`.
Frontend code should display `payload.error` and treat `401` as a login/session
problem.

## Do Not Use

- Do not introduce Better Auth UI providers or generated auth clients.
- Do not use React Router auth loaders/actions in this Next.js app.
- Do not expose bootstrap or provider tokens in `NEXT_PUBLIC_*` variables.
- Do not store raw session tokens in D1.
- Do not allow self-disable through the admin panel.
