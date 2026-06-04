# Environment And Cloudflare Runtime

> Production configuration contract for the Cloudflare-only business runtime.

---

## Production Runtime

This project's business runtime is Cloudflare Workers through OpenNext. The
previous local Python/Swift services, LaunchAgents, static workbench, and
Cloudflare Tunnel scripts have been removed from source control and must not be
reintroduced as production infrastructure.

Production hostname:

- `https://pdf-audit.bobochang.cn`

Deploy from `web/`:

```bash
env -u CLOUDFLARE_API_TOKEN npm run cf:deploy
```

Use `env -u CLOUDFLARE_API_TOKEN` on this machine so Wrangler uses the browser
authenticated Cloudflare session instead of a stale or narrow token.

## Bindings

Configured in `web/wrangler.jsonc`:

| Binding | Purpose |
| --- | --- |
| `AUDIT_DB` | D1 database for jobs, users, sessions, quotas, and ledger |
| `AUDIT_BUCKET` | R2 bucket for uploaded PDFs and OCR artifacts |
| `NEXT_INC_CACHE_R2_BUCKET` | OpenNext incremental cache bucket |

Access Cloudflare bindings through runtime helpers:

- `getCloudflareD1Binding()` in `web/src/lib/cloudflare-env.ts`
- `getR2Binding()` inside `web/src/lib/cloud-object-store.ts`

Do not access Hono `c.env`; this app is not a Hono Worker.

## Required Variables And Secrets

Production variables:

| Name | Expected value |
| --- | --- |
| `AUDIT_RUNTIME_MODE` | `paddleocr` |
| `NEXT_PUBLIC_AUDIT_RUNTIME_MODE` | `paddleocr` |
| `AUDIT_DB_DRIVER` | `d1` |
| `AUDIT_OBJECT_STORE_DRIVER` | `r2-binding` |
| `AUDIT_OBJECT_STORE_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `AUDIT_OBJECT_BUCKET` | `pdf-audit-artifacts` |
| `AUDIT_OBJECT_REGION` | `auto` |
| `AUDIT_OBJECT_PREFIX` | `jobs` |
| `PADDLEOCR_API_BASE_URL` | `https://paddleocr.aistudio-app.com/api/v2/ocr` |
| `PADDLEOCR_MODEL` | `PaddleOCR-VL-1.5` |
| `PADDLEOCR_POLL_INTERVAL_MS` | `5000` |

Required Worker secrets:

| Secret | Purpose |
| --- | --- |
| `AUTH_BOOTSTRAP_TOKEN` | One-time first-admin bootstrap guard |
| `PADDLEOCR_API_TOKEN` | PaddleOCR provider authorization |
| `AUDIT_OBJECT_ACCESS_KEY_ID` | R2 S3 API access key for browser direct upload signing |
| `AUDIT_OBJECT_SECRET_ACCESS_KEY` | R2 S3 API secret key for browser direct upload signing |

Never commit secrets or copy them into spec files, docs, screenshots, source, or
`NEXT_PUBLIC_*` variables.

When the two R2 S3 signing secrets are present, `POST /api/audit/cloud-uploads`
returns `uploadMode=r2-presigned` and the browser uploads large PDFs directly to
R2. Without those secrets the app falls back to the Worker upload route.

## Local/Test Fallbacks

The code still contains local/test fallback drivers so tests can run without
Cloudflare:

- `AUDIT_DB_DRIVER=sqlite` forces SQLite fallback.
- `AUDIT_OBJECT_STORE_DRIVER=local` is not valid for cloud upload production.
- `better-sqlite3` is a local/test dependency only.

Do not revive the retired local business runtime for production traffic. Local
fallbacks are limited to test/development adapters such as SQLite.

## Misconfiguration Behavior

| Condition | Expected behavior |
| --- | --- |
| Missing `AUTH_BOOTSTRAP_TOKEN` | `/api/auth/bootstrap` fails closed with `503` |
| Missing `PADDLEOCR_API_TOKEN` | OCR submission fails closed |
| Invalid PaddleOCR token | Provider `401` maps to a user-readable auth failure |
| Missing D1 binding | API fails rather than silently using production-local data |
| Missing R2 binding | Cloud upload fails rather than writing local files |
| DNS points to Tunnel/local origin | Treat as stale infrastructure and rebind to Worker |

## Verification

After environment or deployment changes:

```bash
npm run test
npm run lint
npm run build
npm run cf:build
env -u CLOUDFLARE_API_TOKEN npm run cf:deploy
curl -I https://pdf-audit.bobochang.cn/
curl -fsS https://pdf-audit.bobochang.cn/api/auth/me
```

The unauthenticated `/api/auth/me` check should return `401` JSON. A `200`
there without a valid session is a security regression.

## Do Not Use

- Do not use `wrangler.toml` examples; the project uses `web/wrangler.jsonc`.
- Do not use Vite `import.meta.env` conventions.
- Do not use Hono `c.env` conventions.
- Do not read secrets at module scope for long-lived global caches.
