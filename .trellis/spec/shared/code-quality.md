# Code Quality Guidelines

> Shared code quality rules for the `web/` app and project docs.

---

## Required Checks

For code changes, run from `web/`:

```bash
npm run test
npm run lint
npm run build
npm run cf:build
```

For docs-only `.trellis/spec` changes:

```bash
git diff --check
```

Run deployment only when the task changes production behavior or configuration:

```bash
env -u CLOUDFLARE_API_TOKEN npm run cf:deploy
```

## Mandatory Rules

- No `any`; use project types or `unknown` plus narrowing.
- No non-null assertions.
- No committed secrets, tokens, `.env`, `.dev.vars`, local DBs, uploaded PDFs,
  OCR outputs, or provider artifacts.
- No production dependency on local Python/Swift/macOS services.
- Use same-origin API paths in the browser.
- Keep Cloudflare D1/R2/PaddleOCR secrets server-only.

## Naming Conventions

| Thing | Convention | Example |
| --- | --- | --- |
| Next.js routes | App Router folders | `app/api/auth/me/route.ts` |
| React components | PascalCase exports in kebab-case files | `audit-command-center.tsx` |
| Utilities | kebab-case files | `cloud-object-store.ts` |
| Type files | Existing domain names | `audit-types.ts`, `auth-types.ts` |
| Tests | Co-located or lib-focused `.test.ts` | `paddleocr.test.ts` |
| Constants | SCREAMING_SNAKE_CASE for true constants | `MAX_UPLOAD_QUOTA_BYTES` |

## Error Handling

- Use `AppError` for expected server failures.
- Use `jsonError` in route `catch` blocks.
- Use user-readable Chinese messages for API errors that the UI displays.
- Do not return stack traces or raw provider payloads.

## Testing

Add or update tests when changing:

- auth/password/session behavior
- quota ledger math
- upload validation or R2 object-key rules
- PaddleOCR request/response parsing
- date extraction and audit classification
- evidence text cleanup

Prefer focused unit tests for pure helpers and route/service tests for auth,
quota, storage, and provider orchestration.

## Review Checklist

- [ ] Does the code follow the existing Next.js App Router layout?
- [ ] Are Cloudflare bindings accessed through existing helpers?
- [ ] Are secrets server-only?
- [ ] Are quotas checked before expensive work?
- [ ] Are D1/R2/PaddleOCR failures surfaced clearly?
- [ ] Does UI text wrap/clamp long filenames, emails, quota values, and OCR
      evidence?
- [ ] Did the task update Trellis specs if it discovered a durable rule?
