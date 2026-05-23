# Backend Quality Guidelines

> Quality checks and review standards for API routes and server-side library
> code in `web/`.

---

## Required Checks

Run from `web/` before committing backend changes:

```bash
npm run test
npm run lint
npm run build
npm run cf:build
```

For docs-only `.trellis/spec` changes, `git diff --check` is the minimum check.

## Review Checklist

- API routes use `NextResponse` and catch with `jsonError`.
- Protected routes call `requireAuth` or `requireAdmin`.
- Request bodies are validated before side effects.
- Quota is reserved/consumed/refunded through `web/src/lib/quota.ts`.
- D1 writes and R2 writes are ordered so partial failures are handled
  intentionally.
- R2 object keys are validated with `assertSafeObjectKey`.
- PaddleOCR provider payloads are parsed through helper functions before use.
- No secrets, raw tokens, signed URLs, or full OCR blobs are logged.
- No local business runtime is reintroduced for production.

## TypeScript Rules

- No `any`; use explicit types or `unknown` plus narrowing.
- No non-null assertions.
- Exported library functions should have clear input and return types.
- Keep route-local payload types small and move reusable types into
  `web/src/lib/*-types.ts` or the existing domain file.
- Do not add Zod/Hono/Drizzle patterns unless a task adopts those dependencies.

## Database And Storage

- Use D1 in production and SQLite only as local/test fallback.
- Keep SQL in driver modules, not UI or route components.
- Prefer D1 batch operations for related writes when the driver already exposes
  that pattern.
- Avoid `await` in loops for independent I/O; use `Promise.all` or explicit
  sequential loops only when order matters.
- Keep quota ledger append-only.

## API Response Rules

- Expected application failures should throw `AppError`.
- Routes return user-readable Chinese error messages because the UI displays
  them directly.
- Do not return raw provider payloads.
- Use correct HTTP status codes for auth, quota, conflict, retired endpoints,
  and missing resources.

## Deployment-Sensitive Checks

For environment, binding, upload, OCR, auth, or quota changes:

```bash
env -u CLOUDFLARE_API_TOKEN npm run cf:deploy
curl -I https://pdf-audit.bobochang.cn/
curl -fsS https://pdf-audit.bobochang.cn/api/auth/me
```

Unauthenticated `/api/auth/me` should return `401` JSON.

## Do Not Use

- Do not use `pnpm` commands unless the project package manager changes.
- Do not rely on local Python/Swift services for production behavior.
- Do not commit `.env`, `.dev.vars`, tokens, local databases, or OCR outputs.
