# Dependency Version Constraints

> Version and tooling constraints for the current `web/` app. Read this before
> adding or upgrading dependencies.

---

## Current Stack From `web/package.json`

### Production Dependencies

| Package | Current constraint | Notes |
| --- | --- | --- |
| `next` | `16.2.6` | App Router; read local Next docs before API-sensitive edits |
| `react` | `19.2.4` | Must stay aligned with `react-dom` |
| `react-dom` | `19.2.4` | Must stay aligned with `react` |
| `@opennextjs/cloudflare` | `^1.19.11` | Cloudflare deployment compiler/runtime |
| `wrangler` | `^4.93.1` | Deploy and remote D1/R2 operations |
| `tailwindcss` | `^4` | CSS-first Tailwind v4 |
| `@tailwindcss/postcss` | `^4` | PostCSS integration |
| `shadcn` | `^4.7.0` | Component scaffolding/reference |
| `radix-ui` | `^1.4.3` | Primitive package used by shadcn components |
| `lucide-react` | `^1.14.0` | Icons |
| `better-sqlite3` | `^12.9.0` | Local/test SQLite fallback only |
| `vitest` | `^4.1.5` | Unit tests |

This project does **not** currently use React Router, Vite, Hono, Drizzle,
libSQL/Turso, Better Auth, Zod, or React Query. Do not add them merely because a
generic template mentions them.

## Next.js 16 Rule

`web/AGENTS.md` warns that this is not the Next.js behavior most agents may
remember. Before changing framework-sensitive APIs, inspect local docs under
`web/node_modules/next/dist/docs/` or existing code in this repo.

Known local convention:

- `web/src/app/page.tsx` is an async server component and awaits `cookies()`.
- API route handlers use `Request` and `NextResponse`.
- `next.config.ts` sets `experimental.proxyClientMaxBodySize` to `100MB` so
  large PDF upload requests are not truncated before route code runs.

## Cloudflare/OpenNext Commands

Run from `web/`:

```bash
npm run test
npm run lint
npm run build
npm run cf:build
env -u CLOUDFLARE_API_TOKEN npm run cf:deploy
```

Use `env -u CLOUDFLARE_API_TOKEN` for Wrangler/OpenNext deploy commands on this
machine so Wrangler uses the authenticated local Cloudflare session instead of a
stale or narrower environment token.

## Tailwind CSS v4 and shadcn

Global styles live in `web/src/app/globals.css`.

The project uses CSS variables through Tailwind v4's `@theme inline` block. If a
component renders transparent or with missing colors, inspect the actual CSS
variable namespace before changing component markup.

Rules:

- Keep color tokens mapped in `@theme inline`.
- Prefer existing shadcn primitives in `web/src/components/ui/`.
- Do not install new UI libraries without checking bundle and Worker impact.
- Keep card radius to the local primitive default unless a component already has
  a project-specific style.

## Dependency Change Checklist

Before adding a dependency:

1. Search the repo for an existing helper or primitive.
2. Confirm it works in Next.js 16 plus OpenNext Cloudflare Workers.
3. Check whether it imports Node-only APIs at runtime.
4. Add focused tests if it affects parsing, storage, auth, or upload flows.
5. Run `npm run build` and `npm run cf:build`.

Never commit real provider tokens, Cloudflare secrets, or local `.env` files.
