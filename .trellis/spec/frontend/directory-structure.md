# Directory Structure

> Frontend and API structure for the `web/` Next.js 16 App Router application.

---

## Project Tree

```text
web/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   └── api/**/route.ts
│   ├── components/
│   │   ├── audit/
│   │   ├── auth/
│   │   ├── ui/
│   │   ├── theme-provider.tsx
│   │   └── theme-toggle.tsx
│   └── lib/
│       ├── audit-*.ts
│       ├── auth-*.ts
│       ├── cloud-object-store.ts
│       ├── evidence-text.ts
│       ├── paddleocr*.ts
│       ├── quota*.ts
│       └── utils.ts
├── next.config.ts
├── wrangler.jsonc
├── package.json
└── tsconfig.json
```

The repository root still contains historical Python/Swift/local-web files. Do
not extend those for production business behavior unless the user explicitly
asks for local tooling work.

## App Router Conventions

- `web/src/app/page.tsx` is the authenticated app shell. It reads the HttpOnly
  session cookie server-side and renders either `SignInPanel` or
  `AuditCommandCenter`.
- API endpoints live under `web/src/app/api/**/route.ts`.
- New pages use Next.js App Router file conventions. There is no
  `routes.ts`, React Router, or Vite route registration in this project.
- API routes should export `runtime = "nodejs"` so OpenNext compiles them
  consistently for Cloudflare Workers with `nodejs_compat`.

## Component Layout

| Directory | Purpose |
| --- | --- |
| `components/audit/` | Main PDF audit workbench, upload flow, history, results, admin quota UI |
| `components/auth/` | Sign-in/bootstrap-facing UI |
| `components/ui/` | shadcn-style primitives; keep generic and domain-free |
| `components/theme-*` | Theme provider/toggle |

Rules:

- Keep PDF audit domain UI in `components/audit/`.
- Keep reusable visual primitives in `components/ui/`.
- Do not put UI cards inside UI cards; use cards for repeated entities,
  modals, and framed tools only.
- Use lucide icons for icon buttons and status affordances when a matching icon
  exists.
- Keep dashboard/workbench layouts dense and operational; avoid landing-page
  hero patterns for the audit console.

## Client vs Server Components

- Components using `useState`, `useEffect`, browser file APIs, polling, or
  direct event handlers must start with `"use client"`.
- Server components should fetch initial authenticated data when possible, as
  `page.tsx` does with cookies and `getAuditDb()`.
- Pass serializable data into client components; do not pass database instances,
  request objects, or secrets.

## Import Alias

`web/tsconfig.json` maps `@/*` to `./src/*`.

```typescript
import { AuditCommandCenter } from "@/components/audit/audit-command-center"
import { getAuditDb } from "@/lib/audit-db"
```

Use `@/` for imports inside `web/src`. Use relative imports only for very local
files when it improves clarity.

## File Naming

| Element | Convention | Example |
| --- | --- | --- |
| Component files | kebab-case | `audit-command-center.tsx` |
| Utility files | kebab-case | `cloud-object-store.ts` |
| Test files | `*.test.ts` under `lib/__tests__/` | `paddleocr.test.ts` |
| API routes | Next.js `route.ts` | `api/auth/me/route.ts` |
| Dynamic API segments | bracket segments | `[jobId]/file/route.ts` |

## Production Upload UI Flow

The main UI flow in `AuditCommandCenter` is:

1. Create cloud upload session through `/api/audit/cloud-uploads`.
2. Upload PDF to returned same-origin Worker route.
3. Submit PaddleOCR job through `/api/audit/cloud-uploads/paddleocr`.
4. Poll `/api/audit/jobs/{id}/status`.
5. Load `/api/audit/jobs/{id}/result`.

When changing any step, update both UI payload types and backend response
contracts together.
