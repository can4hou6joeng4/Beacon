# Binding Frontend Coding Rules — pdf-certificate-expiry-checker (`web/`)

Compiled from `.trellis/spec/frontend/*`, `.trellis/spec/shared/*`, `.trellis/spec/guides/index.md`, `.trellis/spec/backend/{index,api-module,quality}.md`, `web/AGENTS.md`, `web/package.json`, `web/eslint.config.mjs`, `CLAUDE.md`, and verified against live code (`globals.css`, `layout.tsx`, `components.json`, `next.config.ts`, `theme-*.tsx`, `ui/tabs.tsx`, `lib/api-response.ts`, `lib/__tests__/`).

---

## 1. Hard Rules Checklist

### 1.1 Scope and stack

- **MUST** put all live code in `web/` — never build in root-level `src/`, `swift/`, `static/`, `tests/`, `deploy/` (retired local runtime); never restore the local Python/macOS/Tunnel runtime. Legacy 410 routes are intentional tombstones. *(CLAUDE.md "What this repo is"; frontend/directory-structure.md "Project Tree"; shared/code-quality.md "Mandatory Rules")*
- **MUST** keep production deployment compatible with OpenNext Cloudflare Workers. *(frontend/quality.md "Framework Rules")*
- **MUST NOT** introduce Vite, React Router, or client-side route registration (no `routes.ts`). *(frontend/quality.md "Framework Rules"; frontend/directory-structure.md "App Router Conventions"; frontend/components.md "Do Not Use")*
- **MUST** use npm, not pnpm; everything runs from `web/` (repo root has no package.json). *(CLAUDE.md "Commands"; backend/quality.md "Do Not Use")*

### 1.2 Dependencies — banned and allowed

- **BANNED** (explicitly, do not add even if a generic recipe suggests them): **React Query/TanStack Query, Better Auth (and its UI/generated clients), Zod, Hono, Drizzle, React Router, Vite, libSQL/Turso, OAuth providers, any new component/UI library** without checking existing primitives first. *(shared/dependency-versions.md "Current Stack"; frontend/hooks.md "Do Not Use"; frontend/authentication.md "Do Not Use"; frontend/quality.md "Dependency Discipline"; backend/index.md header)*
- **Allowed list — exact `web/package.json` as of now:**
  - dependencies: `better-sqlite3 ^12.9.0` (local/test SQLite fallback only — never import statically into Worker paths), `class-variance-authority ^0.7.1`, `clsx ^2.1.1`, `lucide-react ^1.14.0`, `next 16.2.6` (pinned exact), `next-themes ^0.4.6`, `radix-ui ^1.4.3` (monolithic package), `react 19.2.4`, `react-dom 19.2.4` (must stay aligned with react), `recharts ^3.8.1`, `shadcn ^4.7.0` (runtime dep), `sonner ^2.0.7`, `tailwind-merge ^3.5.0`, `tw-animate-css ^1.4.0`
  - devDependencies: `@opennextjs/cloudflare ^1.19.11`, `@tailwindcss/postcss ^4`, `@types/better-sqlite3 ^7.6.13`, `@types/node ^20`, `@types/react ^19`, `@types/react-dom ^19`, `esbuild ^0.28.0`, `eslint ^9`, `eslint-config-next 16.2.6`, `tailwindcss ^4`, `typescript ^5`, `vitest ^4.1.5`, `wrangler ^4.93.1`
- **Before adding any frontend dependency, MUST**: (1) search `web/src/components/ui/` and existing helpers for an equivalent; (2) confirm it works with React 19 + Next 16 + OpenNext Cloudflare Workers; (3) check runtime size and whether it imports Node-only APIs; (4) add focused tests if it changes parsing/formatting/state machines; (5) run `npm run build` and `npm run cf:build`. *(frontend/quality.md "Dependency Discipline"; shared/dependency-versions.md "Dependency Change Checklist")*

### 1.3 Imports and file layout

- **MUST** use the `@/` alias (maps to `web/src/*` via `web/tsconfig.json`) for imports inside `web/src`; relative imports only for very local files when it improves clarity. *(frontend/directory-structure.md "Import Alias")*
- **EXCEPTION — tests MUST use relative imports**: Vitest 4 runs with zero config file, and the `@/` alias does not resolve in vitest. Tests live in `web/src/lib/__tests__/*.test.ts` (verified: existing tests import `../auth-types` etc.). *(CLAUDE.md "Tests"; frontend/directory-structure.md "File Naming")*
- **MUST** use `import type` for type-only imports. *(shared/typescript.md "Type Imports")*
- File naming: components and utilities in **kebab-case** files with PascalCase exports (`audit-command-center.tsx`); type files keep existing domain names (`audit-types.ts`, `auth-types.ts`); tests `*.test.ts` under `lib/__tests__/`; API routes `route.ts` with bracket dynamic segments (`[jobId]/file/route.ts`); true constants SCREAMING_SNAKE_CASE. *(frontend/directory-structure.md "File Naming"; shared/code-quality.md "Naming Conventions")*
- Component layout: PDF-audit domain UI in `components/audit/`; sign-in/bootstrap UI in `components/auth/`; generic domain-free primitives in `components/ui/`; theme in `components/theme-*`. *(frontend/directory-structure.md "Component Layout")*
- New pages/API routes use Next.js App Router file conventions under `web/src/app/`; do not add production behavior outside `web/`. *(frontend/directory-structure.md)*

### 1.4 Type safety

- **MUST NOT** use `any` — anywhere, including tests; use explicit project types or `unknown` plus narrowing/type guards. *(frontend/quality.md "TypeScript"; shared/typescript.md "Unknown Over Any"; shared/code-quality.md "Mandatory Rules")*
- **MUST NOT** use non-null assertions (`!`). Narrow explicitly (e.g. `fileInputRef.current?.files?.[0]`, guard `selected`, optional row fields). *(shared/code-quality.md; frontend/type-safety.md "Nullability"; shared/typescript.md "Nullability")*
- **MUST** import shared domain types from `web/src/lib/` instead of redefining response shapes per component: e.g. `import type { AuditHistoryJob, AuditResult, AuditSummary } from "@/lib/audit-types"`, `PublicUser` from `@/lib/auth-types`, `StageState` from `@/lib/audit-progress`. Do not duplicate backend response types in multiple components; do not create hooks that duplicate API response types. *(frontend/type-safety.md "Import Project Types"; frontend/quality.md "TypeScript"; frontend/hooks.md "Do Not Use")*
- Small route-local payload wrappers in components are acceptable only as an optional-`error` wrapper around shared types: `type ResultPayload = { job: AuditHistoryJob; result: AuditResult; error?: string }`. *(frontend/type-safety.md)*
- **Fetch response typing**: treat `response.json()` as unknown; parse with a safe fallback then cast to an explicit payload type — `const payload = (await response.json().catch(() => ({ error: "读取结果失败" }))) as ResultPayload`. Payload types read after a non-OK response **MUST** include `error?: string`. Do not access nested response data before checking `response.ok`. *(frontend/type-safety.md "Fetch Response Typing")*
- Use `T | null` for intentionally-absent state (selected rows, current job, result, stage, loading IDs). *(frontend/type-safety.md "Nullability")*
- Props: inline types for small components; named types when reused. Use `type` for object shapes/unions; `interface` only when merging/extension is genuinely useful. *(frontend/type-safety.md "Component Props"; shared/typescript.md "Object Types")*
- **Form values MUST stay strings while editing**; convert to numbers only at the API boundary (see `CreateFormState`/`UserEditState`/`numberFromInput` in `admin-user-panel.tsx`). Never store partially typed numeric input as `number`. *(frontend/type-safety.md "Form Values")*
- Exported library functions get explicit return types, especially across route/service/db boundaries. *(shared/typescript.md "Explicit Exported Types")*
- Runtime validation is **manual type guards** (e.g. `isRecord`), never a schema library. *(shared/typescript.md "Runtime Validation")*
- Use literal discriminated unions for state (`AuditStatusValue`, `PaddleOcrState`, `UserRole`, `UserStatus`, `QuotaResource`) and strict-equality narrowing. *(shared/typescript.md "Discriminated Unions")*
- Numeric names carry units: `pollIntervalMs`, `uploadExpiresSeconds`, `uploadBytesLimit`, `ocrPagesLimit`. *(shared/typescript.md "Units In Names")*

### 1.5 Timestamps

- **All persisted/API timestamps are ISO-8601 strings** (`new Date().toISOString()`): `AuditHistoryJob.createdAt/updatedAt/completedAt`, auth user/session timestamps, quota ledger timestamps. Do not assume Unix ms unless the type says `number`. *(shared/timestamp.md "Current Contract"; frontend/type-safety.md "Timestamps")*
- Format only at the display edge (e.g. `new Date(job.createdAt).toLocaleString("zh-CN")`); keep raw values intact for sorting/comparison/round-trips. *(shared/timestamp.md "UI Formatting")*
- **MUST NOT** mix Unix seconds with ISO strings in payloads; numeric time values are only for durations/limits/progress and must be unit-named. *(shared/timestamp.md "Do Not Use", "Numeric Time Values")*

### 1.6 Hooks and async state

- Default pattern: interactive behavior colocated in feature client components. **Extract a custom hook only when** the state machine is reused by more than one component, or extraction makes a large component meaningfully easier to test. *(frontend/hooks.md "Current Pattern"; frontend/index.md "Core Rules")*
- Hook naming: `use{Feature}{Concern}`, domain-specific (`useAuditPolling`, `useAuditHistory`, `useAdminUsers`, `useQuotaDisplay`); **never** generic `useData`/`useApi`. *(frontend/hooks.md "Naming")*
- Fetch pattern rules: same-origin **relative** URLs; `cache: "no-store"` for auth/history/job-status/quota/admin data; always type parsed JSON; user-facing failures via `payload.error || fallback`. *(frontend/hooks.md "Async Fetch Pattern"; frontend/type-safety.md)*
- If extracting the upload/poll flow into a hook, **preserve the existing states**: current job, stage/progress, result + distribution, current user quota, upload/submission/loading flags, user-facing error string. Do not hide quota refreshes inside unrelated UI components. *(frontend/hooks.md "Upload And Polling State")*
- **Retry**: bounded retry only for transient failures — `fetchWithRetries` retries 5xx and thrown fetch errors; **MUST NOT** retry client errors (`400`, `401`, `402`, `409`), quota exhaustion, auth failure, invalid file type, or object-key mismatch. *(frontend/hooks.md "Retry Pattern"; frontend/quality.md "Async UX")*
- Effects: `useEffect` for initial client-only loads; explicit dependency arrays; cancel/guard long-running effects; **use `window.setTimeout` for browser polling, not Node timers**. *(frontend/hooks.md "Effects")*
- Memoize (`useMemo`) derived lists/display choices depending on result data (filtered rows, default tab, counts, headline); do not memoize simple primitives for style. *(frontend/hooks.md "Memoization")*
- **MUST NOT**: fetch inside a component render body; store provider or session tokens in hook state; use browser storage as session authority (HttpOnly cookie is the authority). *(frontend/hooks.md "Do Not Use")*
- Client polling cadence in the current app: `GET /api/audit/jobs/[id]/status` every 1.5s — the status GET **is the pipeline engine**; if nobody polls, nothing progresses. Never assume a background worker. *(CLAUDE.md "Architecture")*

### 1.7 Auth integration

- First-party cookie sessions only. Cookie `pdf_audit_session` is HttpOnly, SameSite=Lax, path=/, secure on HTTPS/prod. **MUST NOT** read the session cookie in client code. *(frontend/authentication.md "Session Contract", "Frontend Integration")*
- `web/src/app/page.tsx` is the server-side gate: awaits `cookies()`, calls `getAuthContextFromCookieHeader`, renders `SignInPanel` (unauthenticated) or `AuditCommandCenter` (with current user + initial history/result payloads). Preserve this shape. *(frontend/authentication.md "Frontend Integration"; frontend/directory-structure.md)*
- Client components call same-origin APIs with relative URLs and `cache: "no-store"` (`fetch("/api/auth/me", { cache: "no-store" })`). *(frontend/authentication.md)*
- **Login is username/account based**: UI label is `账号`; browser login sends `{ username, password }` — **not** `{ email, password }` (explicit Wrong/Correct pair in spec). `PublicUser.username` is the display identifier. Email is optional legacy fallback handled server-side only. *(frontend/authentication.md "Account Login Contract" §3, §7)*
- Auth error matrix the UI must expect: `400 INVALID_USERNAME` (username not 3–32 chars, lowercase-normalized letters/digits/`_`/`-`, starting alphanumeric), `400 INVALID_EMAIL`, `409 USER_EXISTS`, `401 INVALID_CREDENTIALS` (wrong password or disabled user). Passwords ≥ 10 chars. Treat `401` as a login/session problem. *(frontend/authentication.md §4, "User Creation Rules", "Error Contract")*
- Quota display **MUST** use the server-provided `currentUser.quota` snapshot on `PublicUser`; never recompute usage in the browser. Quota semantics: ledger period says `"lifetime"` but usage windows to the current UTC day — daily reset is by design, do not "fix" it. *(frontend/authentication.md "Quota-Aware Auth Context"; CLAUDE.md "Auth and quota")*
- Admin UI rules: admin user management lives in an admin-only dialog opened from a compact command button (not the sidebar); disable self-disable; server validation is authority — client `min`/`max` are UI affordances only. *(frontend/components.md "Admin Forms"; frontend/authentication.md "Do Not Use")*
- **MUST NOT** expose bootstrap/provider tokens in `NEXT_PUBLIC_*`; never log raw passwords, session tokens, PaddleOCR tokens, bootstrap tokens, or R2 credentials. *(frontend/authentication.md "Password And Token Storage", "Do Not Use")*
- Auth transitions use `window.location.reload()` (no client router state for auth). *(CLAUDE.md "Frontend")*

### 1.8 Backend contract the frontend must honor

- **Success responses are plain domain JSON** (no `{data}` wrapper): `{ job }`, `{ user }`, `{ result, job, distribution }`. **Error responses are `{ error: string, code?: string }`** — `jsonError` emits `{ error, code }` for `AppError` and `{ error }` with status 500 otherwise (verified in `web/src/lib/api-response.ts`). UI displays `payload.error`. *(backend/api-module.md "API Response Contract"; CLAUDE.md "API route conventions")*
- All user-facing strings — UI text **and** API error messages — are **Chinese**. *(CLAUDE.md; shared/code-quality.md "Error Handling"; backend/quality.md "API Response Rules")*
- Error codes the UI must be able to handle: `UNAUTHENTICATED`, `ADMIN_REQUIRED`, `QUOTA_EXHAUSTED`, `UPLOAD_QUOTA_LIMIT_EXCEEDED`, `UPLOAD_SESSION_FAILED` (tell user to create a fresh check), `UPLOAD_SESSION_COMPLETED`, `UPLOAD_ALREADY_SUBMITTED`, `UPLOAD_SESSION_STALE`, `OCR_PAGE_LIMIT_EXCEEDED`, `PADDLEOCR_UNAUTHORIZED`; plus auth codes `INVALID_USERNAME`, `INVALID_EMAIL`, `USER_EXISTS`, `INVALID_CREDENTIALS`. *(backend/api-module.md "API Response Contract"; frontend/authentication.md §4)*
- **Ownership/404 semantics**: foreign jobs return **404, never 403** (admins see all). The UI must treat 404 on a job as "not found", not attempt permission recovery. *(CLAUDE.md "API route conventions")*
- **Pipeline endpoints (fixed sequence the UI drives)**: 1) `POST /api/audit/cloud-uploads` → job + upload URL (object key `jobs/{jobId}/input.pdf`); 2) browser `PUT`s PDF to same-origin `/api/audit/cloud-uploads/{jobId}/file` (r2-binding mode; presigned S3 only when `AUDIT_OBJECT_*` secrets exist); 3) `POST /api/audit/cloud-uploads/paddleocr` (idempotent; re-upload after submission → 409); 4) poll `GET /api/audit/jobs/{id}/status`; 5) load `GET /api/audit/jobs/{id}/result`; 6) refresh history + current-user quota after quota-changing operations. **When changing any step, update UI payload types and backend response contracts together.** *(frontend/directory-structure.md "Production Upload UI Flow"; frontend/hooks.md; backend/api-module.md "Cross-Layer Route Flow"; CLAUDE.md)*
- Reads (`result`, `download/[file]`, `reanalyze`) serve from stored R2 artifacts and never recompute; `POST .../reanalyze` re-runs the analyzer with the job's **original** cutoff, no quota charge. *(CLAUDE.md "Architecture")*
- **OCR analysis contract (display semantics)**: categories are `matches` (expiry ≤ cutoff, **inclusive** — expiry equal to cutoff is already expired), `near_expiry` (≤ cutoff + 45 days, hardcoded), `needs_review` (validity marker present, date unparsable — including missing 使用有效期 on 造价师 certificate pages), and derived `有效` = candidates − flagged (**never stored**). `长期` never expires. 造价师 pages use the document 使用有效期, not the body registration date. OCR-garbled labels (史用效期, 更用效期) count as the same field. *(backend/api-module.md "OCR Result Analysis Contract"; CLAUDE.md "The analyzer")*
- Never expose public R2 object URLs, PaddleOCR tokens, provider URLs, or object-storage URLs in the browser/persistent UI; keep provider details behind same-origin API calls. *(backend/api-module.md "Cloud Upload Flow"; frontend/components.md "Do Not Use"; frontend/quality.md "Async UX")*

### 1.9 Components and rendering

- Components using `useState`, `useEffect`, browser file APIs, polling, `window`, `localStorage`, `setTimeout`, or direct event handlers **MUST** start with `"use client"`. Keep browser-only APIs inside client components. *(frontend/directory-structure.md "Client vs Server Components"; frontend/components.md "Server And Client Components")*
- Server components fetch initial authenticated data when possible; pass **typed, serializable** payloads into client components (never db instances, request objects, secrets); avoid refetching on first paint when the server already loaded the data. *(frontend/directory-structure.md; frontend/components.md)*
- Prefer existing local shadcn primitives in `web/src/components/ui/`: `Button` (commands/icon buttons), `Card` (repeated entities, forms, bounded tool panels), `Dialog` (record details), `Tabs` (result categories), `Badge` (statuses/counts), `Alert` (blocking errors), `Progress` (upload/OCR progress). *(frontend/components.md "UI Primitives")*
- Use `lucide-react` icons for recognizable actions/status affordances; icon-only buttons **MUST** include `sr-only` labels. *(frontend/components.md; frontend/directory-structure.md "Component Layout")*
- Layout doctrine: the first screen is a usable, **dense, operational audit console** — no marketing hero sections; no cards nested inside cards (cards only for repeated entities, modals, framed tools, repeated metrics/records); stable grid tracks for tables/tabs/quota fields/progress; long filenames/emails/evidence/OCR lines must wrap or truncate intentionally (`break-words`, clamping, scroll containers). *(frontend/components.md "Audit Console Layout"; frontend/directory-structure.md; frontend/quality.md "UI Quality")*
- Task pipeline: centered near the top of the main content area; horizontal stepper on desktop collapsing to grid rows on small screens; sidebar stays focused on account/quota + upload controls; pipeline changes are presentational unless a task explicitly changes behavior; animations lightweight CSS/Tailwind, only on active step/running progress, **must not change layout dimensions or hide text**; done/active/waiting/failed states stay distinct. *(frontend/components.md "Task Pipeline")*
- Evidence/OCR text: render for reading — cleaned evidence for table previews, clamped previews in tables, scrollable blocks in dialogs, preserve line breaks by rendering line arrays (`evidenceLines` from `@/lib/evidence-text`), `break-words` for long fragments. **MUST NOT** use `dangerouslySetInnerHTML` or render OCR/provider text as HTML. *(frontend/components.md "Evidence Text"; frontend/quality.md "UI Quality")*
- Accessibility (**MUST**): semantic HTML — `button` for actions (never clickable `div`s), `label` for inputs, `main` for app content, `section` for grouped content; preserve heading order in dialogs/panels; `aria-expanded` on collapse buttons; dialogs have meaningful titles (+ descriptions when helpful); focusable controls visible and reachable. *(frontend/components.md "Accessibility"; frontend/quality.md "Accessibility")*
- Async UX (**MUST**): show user-facing errors from `payload.error`; keep upload/OCR state visible through staged state; refresh current-user quota after upload-session creation, OCR submission, and completed result loading. *(frontend/quality.md "Async UX"; frontend/index.md "Core Rules")*
- State management: plain `useState` + props drilling; **no state libraries**. *(CLAUDE.md "Frontend")*

### 1.10 Security / secrets

- No committed secrets, tokens, `.env`, `.dev.vars`, local DBs, uploaded PDFs, OCR outputs, or provider artifacts. Cloudflare D1/R2/PaddleOCR secrets stay server-only. Same-origin API paths in the browser. *(shared/code-quality.md "Mandatory Rules"; shared/dependency-versions.md)*

---

## 2. Visual-System Constraints

- **Tailwind 4, CSS-first — no `tailwind.config`** (`components.json` has `"tailwind.config": ""`). All tokens/variants/keyframes live in `web/src/app/globals.css`:
  - Imports: `@import "tailwindcss"; @import "tw-animate-css"; @import "shadcn/tailwind.css";` (note: `shadcn` is a **runtime dependency** whose CSS is imported — do not remove it as "just a CLI").
  - Dark variant is declared as `@custom-variant dark (&:is(.dark *));` — class-based dark mode.
  - Tokens are mapped in an `@theme inline` block: `--color-background: var(--background)` … including sidebar tokens, `--color-chart-1..5`, and a radius scale derived from `--radius` (0.5rem): `--radius-sm` = ×0.6, `--radius-md` = ×0.8, `--radius-lg` = ×1, up to `--radius-4xl` = ×2.6. Keep color tokens mapped in `@theme inline`; if a component renders transparent/colorless, inspect the CSS-variable namespace before changing markup. *(shared/dependency-versions.md "Tailwind CSS v4 and shadcn")*
  - Palette values are **oklch** in `:root` and `.dark` blocks. Light primary/ring is the brand teal `oklch(0.44 0.09 219)` (brand accent `#176b87`); dark border/input use alpha oklch (`oklch(1 0 0 / 10%)`).
  - Base layer applies `border-border outline-ring/50` to `*`, `bg-background text-foreground` to `body`, `font-sans` to `html`.
  - Custom keyframes live here too (e.g. `@keyframes pipeline-flow`). Add new keyframes to `globals.css`, not a config file.
- **shadcn style is `radix-nova`, not classic shadcn** (`components.json`: style `radix-nova`, baseColor `neutral`, cssVariables true, iconLibrary `lucide`, rsc true). Aliases: `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`.
- **Radix comes from the monolithic `radix-ui` package** — `import { Tabs as TabsPrimitive } from "radix-ui"` — **never** `@radix-ui/react-*`. (Verified in `ui/tabs.tsx`, `ui/sheet.tsx`, `ui/progress.tsx`, `ui/label.tsx`.)
- **The active-state Tailwind variant is `data-active:`**, not `data-[state=active]:` (verified in `ui/tabs.tsx`: `data-active:bg-background data-active:text-foreground dark:data-active:border-input …`). Compound group variants like `group-data-[variant=line]/tabs-list:data-active:` and `group-data-vertical/tabs:` are in use — follow these shapes.
- Dark styling convention for brand surfaces: pair the `#176b87` accent with `dark:bg-cyan-950/30`-style dark classes (used across `audit/` and `auth/` components). *(CLAUDE.md "Frontend")*
- Keep card radius at the local primitive default unless a component already carries a project-specific style. *(shared/dependency-versions.md)*
- **Fonts: no `next/font`, no link tags.** `layout.tsx` imports only `globals.css`; the font stack is declared entirely in `@theme inline`: `--font-sans`/`--font-heading`: `"Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif`; `--font-mono`: `"Geist Mono", …`. Follow this approach for any font change.
- **Dark mode mechanism**: `next-themes` — `ThemeProvider` wraps children in `layout.tsx` with `attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange`; `<html lang="zh-CN" … suppressHydrationWarning>`. Toasts via `sonner` `<Toaster position="top-right" richColors closeButton />` in the root layout.
- **Hydration idiom (MUST)**: for hydration-sensitive UI, use the `useSyncExternalStore` mounted idiom from `theme-toggle.tsx` — `useSyncExternalStore(() => () => undefined, () => true, () => false)` — **not** `useEffect`-set mounted flags. *(CLAUDE.md "Frontend"; verified in theme-toggle.tsx)*
- Charts use `recharts` (already a dependency; chart color tokens `--chart-1..5` exist in both themes).
- The `.trellis/spec/frontend/examples/frontend-design/` templates are retained bootstrap material: do **not** prefer them over current project components; their `tailwind-fonts.config.template` (a Tailwind config file) contradicts the CSS-first setup — real project files win. *(frontend/index.md "Examples")*
- Root layout metadata/title is Chinese (`PDF 证件有效期审计`); `lang="zh-CN"`.

---

## 3. Next.js 16 Gotchas

- **"This is NOT the Next.js you know."** Next 16.2.6 / React 19 have breaking changes vs training data — APIs, conventions, and file structure may all differ. **Read the relevant guide in `web/node_modules/next/dist/docs/` before writing any framework-sensitive code**, and heed deprecation notices. *(web/AGENTS.md, entire file; frontend/quality.md "Framework Rules"; shared/dependency-versions.md "Next.js 16 Rule")*
- **`cookies()` is async** — `web/src/app/page.tsx` is an async server component and must `await cookies()`. *(CLAUDE.md "Next.js 16 warning"; shared/dependency-versions.md)*
- **Dynamic route params are Promise-typed**: `{ params }: { params: Promise<{ id: string }> }` — await them before use. *(CLAUDE.md "Next.js 16 warning")*
- API route handlers take plain `Request` and return `NextResponse`; API routes export `export const runtime = "nodejs"` so OpenNext compiles them consistently for Workers `nodejs_compat`. *(shared/dependency-versions.md; frontend/directory-structure.md "App Router Conventions"; backend/api-module.md "Route Handler Pattern")*
- **`next.config.ts` pin**: `experimental.proxyClientMaxBodySize` is `100 * 1024 * 1024` (100MB) so large PDF uploads are not truncated before route code runs. The test `web/src/lib/__tests__/next-config.test.ts` asserts it is `>= 100MB` — lowering it fails the suite. Do not remove or reduce. *(shared/dependency-versions.md; CLAUDE.md "Tests"; verified in next.config.ts + test)*
- `npm run build` (`next build`) is fast validation only — passing it does **not** prove Workers compatibility; only `npm run cf:build` catches Node-only API usage. Allowed Node APIs on production paths under `nodejs_compat`: `node:crypto`, `Buffer`, `node:util`, WebCrypto, fetch/streams — **never** `node:fs`, `node:child_process`, `node:net`, or native addons (tests may use `node:fs` since they run in vitest). *(CLAUDE.md "Commands", "Cloudflare Workers constraints")*
- Env vars/bindings are **not** on `process.env` at runtime — always go through helpers (`cloudflare-env.ts`, `paddleocr-runtime.ts`, `cloud-object-store.ts`, built on `getCloudflareContext({async: true})`). Direct reads work in dev/tests and silently break in production. Frontend code should never need bindings; server components use existing helpers (`getAuditDb()` etc.). *(CLAUDE.md "Cloudflare Workers constraints"; guides/index.md "Cloudflare Workers-Specific Layers")*
- No global-scope I/O (random, fetch, timers at module top level). *(backend/index.md "Core Rules Summary")*
- `better-sqlite3` is loaded via dynamic `import()` only — never import it statically anywhere reachable from the Workers bundle. *(CLAUDE.md "Dual-backend data layer")*
- Local dev (`npm run dev`) has no CF bindings — silent SQLite fallback (`web/data/audit.sqlite`); only `npm run cf:preview` exercises D1/R2 bindings locally. Test deployed behavior, not just local. *(CLAUDE.md "Commands"; guides/index.md "Core Principles")*
- Vitest 4 runs with **zero config file** — no plugins, so no `@/` alias resolution and no JSX transform assumptions in tests; tests live in `web/src/lib/__tests__/` and use relative imports. *(CLAUDE.md "Tests")*
- ESLint 9 flat config (`web/eslint.config.mjs`): `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript` with global ignores for `.next/`, `.open-next/`, `out/`, `build/`, `next-env.d.ts`. Practical bites: `@typescript-eslint/no-explicit-any`, unused vars, react-hooks rules (exhaustive-deps), `@next/next` rules (e.g. no `<img>` warnings via core-web-vitals). `npm run lint` runs bare `eslint`.

---

## 4. Quality Gates

- **Required pre-commit check set for frontend (and all code) changes, run from `web/`:**
  ```bash
  npm run test        # vitest run
  npm run lint        # eslint 9 flat config
  npm run build       # next build (fast validation)
  npm run cf:build    # opennextjs-cloudflare build — the real Workers-compat gate
  ```
  *(frontend/quality.md "Required Checks"; shared/index.md "Before Every Commit"; shared/code-quality.md "Required Checks"; CLAUDE.md "Commands")*
- Docs-only `.trellis/spec/` changes: minimum check is `git diff --check`. *(frontend/quality.md; shared/code-quality.md)*
- Single test file: `npx vitest run src/lib/__tests__/<name>.test.ts`. *(CLAUDE.md "Commands")*
- Deploy only when the task changes production behavior/config: `env -u CLOUDFLARE_API_TOKEN npm run cf:deploy` (browser OAuth session, not a possibly-stale token); `cf:deploy` does **not** apply D1 migrations. Post-deploy smoke: `curl -fsS https://pdf-audit.bobochang.cn/api/auth/me` must return 401 JSON when unauthenticated (200 = auth regression). *(shared/code-quality.md; backend/quality.md "Deployment-Sensitive Checks"; CLAUDE.md)*
- **Testing obligations**: add/update tests when changing auth/password/session behavior, quota math, upload validation/object-key rules, PaddleOCR parsing, date extraction/audit classification, or evidence text cleanup. Keep `audit-analyzer.test.ts` / `paddleocr.test.ts` green; analyzer changes carry a mandated test list (leading 使用有效期, cutoff-equality, split range dates, garbled labels + next-line dates, missing use-validity review rows, markup between date and heading, review-form rows ignored). Tests get throwaway DBs via `createAuditDbForPath`/`createAuthDbForPath` + `AUDIT_DB_PATH` + `vi.resetModules()`. *(shared/code-quality.md "Testing"; backend/api-module.md "Required tests"; CLAUDE.md)*
- **Pre-commit self-review checklist (spec-mandated)**: no `any`; no `!`; explicit types on payloads/props; proper error handling; naming conventions followed; no duplicate code; dependency versions match constraints; Tailwind v4 color mappings present when using shadcn; UI text wraps/clamps long filenames/emails/quota values/OCR evidence; secrets server-only; Trellis specs updated if the task surfaced a durable rule. *(shared/index.md "Code Review Checklist"; shared/code-quality.md "Review Checklist")*
- **Pre-modification rule**: before changing any value, `rg "value_to_change" --type ts` first — search before write. *(guides/index.md "The Pre-Modification Rule (CRITICAL)")*
- There is no CI — these local gates are the only enforcement. *(CLAUDE.md "Commands")*
- Neither guide in `.trellis/spec/guides/` binds frontend authoring directly (OAuth guide is explicitly "current project does not use OAuth"; serverless-connection guide is backend). For auth work, `frontend/authentication.md` governs. *(guides/index.md)*

---

## 5. Git/Commit Conventions

- **Commit message format (observed repo convention, consistent across history)**: Conventional-Commit type prefix in English + **Chinese subject**, no trailing period. Types in use: `feat:`, `fix:`, `test:`, `chore:`, `chore(task):`. Examples from `git log`: `fix: 修复注册造价师证使用有效期漏检`, `feat: 升级PaddleOCR默认模型`, `test: 补充上传会话状态错误测试`, `chore: 记录会话日志`, `chore(task): archive 06-17-remaining-certificate-review-fixes` (task-archive commits keep English `archive <task-id>` bodies).
- **Never commit**: secrets, tokens, `.env`, `.dev.vars`, local databases (`web/data/*.sqlite`), uploaded PDFs, OCR outputs, or provider artifacts. *(shared/code-quality.md "Mandatory Rules"; shared/dependency-versions.md; backend/quality.md "Do Not Use")*
- Run the full check set (Section 4) before every commit; verify no non-null assertions and dependency-version compliance as part of the commit checklist. *(shared/index.md "Before Every Commit")*
- Batching: keep commits scoped to one concern (type-prefixed subjects imply single-purpose commits — the history shows separate `fix`/`test`/`chore` commits rather than mixed ones); docs-only spec changes commit separately with `git diff --check` as the gate. *(shared/code-quality.md "Required Checks"; observed history)*
- Update `.trellis/spec/` in the same task when work surfaces a durable rule; **all spec/documentation files must be written in English** (even though UI strings and commit subjects are Chinese). *(shared/code-quality.md "Review Checklist"; frontend/index.md, shared/index.md, backend/index.md, guides/index.md — "Language" footer)*