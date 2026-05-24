# Cloudflare Runtime Performance Research

## Sources

- Cloudflare Workers Placement docs, checked 2026-05-24: Smart Placement can move Worker execution closer to back-end services when that reduces total request duration. Configuration can be `placement.mode = "smart"` or a more explicit backend location/hostname.
- Cloudflare Workers Cache API docs, checked 2026-05-24: `caches.default` is available on Workers custom domains and is per data center rather than globally replicated.
- Cloudflare Workers static assets binding docs, checked 2026-05-24: static assets are normally served nearest to the incoming request; if assets are fetched through a smart-placed Worker, they may be served from the Worker execution location.

## Project Mapping

- Current production runs `web/` through OpenNext on a Cloudflare Worker custom domain.
- `web/wrangler.jsonc` has no `placement` config yet.
- Requests touch several backend services: D1, R2, PaddleOCR API, and the OpenNext incremental cache bucket.
- Page shell and static assets are distinct from slow API flows; they should be optimized separately so OCR/backend placement does not accidentally slow first paint.

## Candidate Actions

- Enable Smart Placement as a low-code experiment for dynamic API requests, then verify with Cloudflare request-duration analytics and the `cf-placement` header.
- Keep static asset delivery on the fastest path nearest to users; if Smart Placement hurts assets, split static/front-door concerns from backend-heavy API paths.
- Add targeted cache headers or Worker cache only for safe immutable/static or public metadata responses. Avoid caching authenticated job history/result pages globally.

