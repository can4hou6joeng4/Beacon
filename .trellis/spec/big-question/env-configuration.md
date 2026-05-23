# Environment Configuration Pitfalls

> **Severity**: P1 - wrong production runtime, missing bindings, or leaked
> secrets.

---

## Problem

The app deploys but production behavior still points at a retired local runtime,
uses missing Cloudflare bindings, or exposes configuration in the wrong layer.

Symptoms:

- `pdf-audit.bobochang.cn` reaches a Tunnel/local origin instead of the Worker.
- Upload creation fails because the R2 binding is missing.
- OCR submission fails because `PADDLEOCR_API_TOKEN` is missing or invalid.
- Auth bootstrap is open or broken because `AUTH_BOOTSTRAP_TOKEN` is missing.
- Browser code expects server-only secrets.

## Current Project Contract

Production runs through:

- Next.js 16 App Router under `web/`
- OpenNext Cloudflare Worker
- D1 binding `AUDIT_DB`
- R2 binding `AUDIT_BUCKET`
- OpenNext cache bucket `NEXT_INC_CACHE_R2_BUCKET`
- PaddleOCR async API

The business runtime is Cloudflare-only. Do not restore macOS LaunchAgents,
local Python/Swift services, or Cloudflare Tunnel as production infrastructure.

## Configuration Sources

| Source | Use |
| --- | --- |
| `web/wrangler.jsonc` | Worker name, compatibility flags/date, D1/R2 bindings, non-secret vars |
| Worker secrets | `AUTH_BOOTSTRAP_TOKEN`, `PADDLEOCR_API_TOKEN` |
| `process.env` | Next/OpenNext-exposed runtime variables in server code |
| `getCloudflareContext({ async: true })` | D1/R2 bindings through OpenNext |
| `NEXT_PUBLIC_*` | Public browser-readable values only |

Never put provider tokens, bootstrap tokens, R2 secret keys, or signed URLs in
`NEXT_PUBLIC_*`.

## Required Production Values

| Name | Expected value |
| --- | --- |
| `AUDIT_RUNTIME_MODE` | `paddleocr` |
| `NEXT_PUBLIC_AUDIT_RUNTIME_MODE` | `paddleocr` |
| `AUDIT_DB_DRIVER` | `d1` |
| `AUDIT_OBJECT_STORE_DRIVER` | `r2-binding` |
| `AUDIT_OBJECT_PREFIX` | `jobs` |
| `PADDLEOCR_API_BASE_URL` | `https://paddleocr.aistudio-app.com/api/v2/ocr` |
| `PADDLEOCR_MODEL` | `PaddleOCR-VL-1.5` |
| `PADDLEOCR_POLL_INTERVAL_MS` | `5000` |

## Binding Access

Use existing helpers:

```ts
const db = await getCloudflareD1Binding()
```

R2 binding access is encapsulated in `web/src/lib/cloud-object-store.ts`.

Do not use framework-template context objects such as `c.env`; this project does
not run a Hono app.

## Common Bad Fixes

| Bad fix | Why it is wrong |
| --- | --- |
| Reinstalling local `cloudflared` service | Restores retired infrastructure |
| Adding provider token to source or docs | Leaks secret |
| Switching production to SQLite | Creates non-production state |
| Using `NEXT_PUBLIC_PADDLEOCR_API_TOKEN` | Exposes provider credential |
| Changing DNS back to Tunnel | Bypasses Worker/D1/R2 deployment |

## Verification

From `web/`:

```bash
npm run test
npm run lint
npm run build
npm run cf:build
env -u CLOUDFLARE_API_TOKEN npm run cf:deploy
curl -I https://pdf-audit.bobochang.cn/
curl -fsS https://pdf-audit.bobochang.cn/api/auth/me
```

The unauthenticated `/api/auth/me` request should return `401` JSON. If it
returns `200`, auth is broken. If it reaches a non-Worker origin, DNS/custom
domain routing is stale.

## Prevention Checklist

- [ ] Search for the config key before changing it.
- [ ] Keep secrets in Worker secrets only.
- [ ] Verify `web/wrangler.jsonc` has expected D1/R2 bindings.
- [ ] Use `env -u CLOUDFLARE_API_TOKEN` for deploys on this machine.
- [ ] Smoke test the production hostname after deployment.
- [ ] Update `.trellis/spec/backend/environment.md` when adding durable config.
