# Hono Framework Guide

> Legacy Trellis template note. Hono is not part of the current production app.

---

The production application is a Next.js 16 App Router project under `web/`,
compiled for Cloudflare Workers through OpenNext.

Use these documents instead:

- `api-module.md`
- `api-patterns.md`
- `environment.md`
- `error-logging.md`

Do not add Hono routers, Hono middleware, `HTTPException`, or `c.env` patterns
to production code unless a future task explicitly migrates the backend stack.
