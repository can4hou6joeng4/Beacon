# Technical Design — Refactor Frontend to Design C "Report Flow"

Companion documents: `prd.md` (requirements + decisions D1–D5), `research/design-c-mapping.md` (token tables, screen/API mapping, gap handling), `research/api-contract.md` (exact endpoint shapes), `research/frontend-coding-rules.md` (binding rules).

## 1. Architecture overview

The refactor is **presentation-only**: every API route, lib module, migration, and the RSC auth gate stay as they are. The client orchestration state machine currently inside `AuditCommandCenter` (create session → PUT → submit → poll → load result; reanalyze; history/quota refresh) is ported intact into a new shell component and re-skinned. The screen model changes from "tabs inside one workbench" to the prototype's **screen switcher**: `submit | processing | report | history | users`, with the topbar hidden during processing.

```
page.tsx (RSC, unchanged logic)
├─ no session → SignInPanel                (rewritten visuals, same login logic)
└─ session    → ReportFlowApp              (new shell client component)
    ├─ state: screen, file, cutoff, pipeline (job/stage/provider/uploadPercent/error),
    │         result payload, history, currentUser, reanalysis, toast/veil
    ├─ Topbar (hidden while screen === "processing")
    ├─ SubmitScreen | ProcessingScreen | ReportScreen | HistoryScreen | UsersScreen
    ├─ Veil (reanalysis / report loading)
    └─ sonner Toaster (bottom-center ink pill, restyled in layout.tsx)
```

## 2. Component contracts

### 2.1 `ReportFlowApp` (`components/audit/report-flow-app.tsx`)

Props: `{ initialHistory: AuditHistoryJob[]; currentUser: PublicUser }` (page.tsx stops passing `initialResult` — it always passes `null` today).

Owned state (all `useState`, no libraries):
- `screen: "submit" | "processing" | "report" | "history" | "users"`
- Submit inputs: `file: File | null` (+ derived name/size), `cutoff: string` (default = today, prototype behavior), `dateTouched: boolean`
- Pipeline: `currentJob`, `stage: StageState | null`, `providerProgress: PaddleOcrProviderProgress | null`, `uploadPercent: number`, `isUploading`, `pipelineError: string`
- Report: `report: { job: AuditHistoryJob; result: AuditResult } | null`, `loadingResultJobId`
- History: `history: AuditHistoryJob[]`
- Reanalysis: `reanalyzingJobId`, veil label
- `pollGeneration: number` ref — incremented on 转入后台/logout/new submit so stale `setTimeout` poll callbacks self-cancel (the current component relies on component lifetime; the new shell must invalidate explicitly because polling can be abandoned via 取消).

Ported functions (logic identical to `audit-command-center.tsx`, only setState targets renamed): `fetchWithRetries`, `uploadErrorMessage`, `refreshCurrentUser`, `refreshHistory`, `loadResult`, `reanalyzeJob`, `pollStatus` (1.5s `window.setTimeout`), `handleStart` (the former `handleSubmit`), `handleSignOut`, `openHistoryJob`.

Progress mapping (per `research/design-c-mapping.md` §3): one `overallPercent` derived function mapping upload stage → 0–36, provider → 38–85, stages 4/5 → 88/94, complete → 100. `ProcessingScreen` animates its own displayed number toward this target with the prototype's rAF easing.

### 2.2 Screens (all `"use client"`, presentation + callbacks only)

- `SubmitScreen` — dropzone (click/drag/keyboard), file row, cutoff input + 今天/+30/+90 pills, step indicator derived `!file ? 1 : dateTouched ? 3 : 2`, quota note `今日剩余：上传 X · OCR 任务 N 次 · 页数 M` from `currentUser.quota` (D4), start button + hint. File validation: `.pdf` name check → toast 仅支持 PDF 文件 (prototype copy).
- `ProcessingScreen` — props `{ filename, targetPercent, statusLabel, activeStep, done, failed, errorMessage, onCancel, onBack }`. rAF eased counter honoring `prefers-reduced-motion`; failure state (R3): status line in danger, dots frozen, button becomes 返回 (D2: normal cancel = 转入后台 toast + return to submit).
- `ReportScreen` — props `{ job, result, onReanalyze, onNewAudit }`. Renders verdict/summary/meta/stat strip/dist bar/search/4 sections/downloads/actions per prototype; row rendering rules from `research/design-c-mapping.md` §4 (items always `[]` for PaddleOCR rows → title-first labels, conditional 书签路径; evidence via `@/lib/evidence-text`; `长期` special case; valid rows derived like `ResultTable`). Downloads: 4 anchor-style buttons hitting `GET /api/audit/jobs/{id}/download/{file}` (D5) — rendered as real `<a href>` links styled as `tbtn` (browser handles download; no fetch).
- `HistoryScreen` — props `{ jobs, onOpen, onOpenRunning }`. Complete → `onOpen` (veil + loadResult + report screen); running/queued → resume polling in processing screen; failed → inline expand message; legacy/non-openable rows non-clickable (`runtime !== "paddleocr" || !providerJobId`); empty state.
- `UsersScreen` — port of `AdminUserPanel` logic (same payload builders, string form state, self-disable guard, busy states) re-skinned to prototype's form grid + user cards; per-card 保存/禁用/启用 via `PATCH /api/admin/users/{id}`; create via `POST /api/admin/users`; results surface through toast instead of Alert banners.
- `Rise` (`components/audit/rise.tsx`) — stagger container (`.rv` + `animationDelay = i*60ms`).
- `report-format.ts` — `formatBytes`, `formatDateTime` (MM-DD HH:mm), `daysFromCutoff`, `statusLabel` display helpers (client-only module, no lib changes).
- `LocalDateTime` — tiny client component using the `useSyncExternalStore` mounted idiom to render local-timezone datetimes only after mount (hydration safety, R3/mapping §5); pre-mount renders the ISO date part.

### 2.3 Auth panel

`SignInPanel` keeps its exact fetch/error/reload logic; markup/styles replaced with the prototype login (wordmark, staggered rise, underline fields, block button, hint line). Error shows as an inline danger line (design extension).

## 3. Visual system implementation

### 3.1 globals.css (single source of tokens — no tailwind.config)

- Map Design C palette onto the **existing shadcn variable names** so kept primitives (button/input/label/sonner) inherit correctly: `--background:#fafaf7`, `--foreground:#16181d`, `--primary:#2742f5`, `--primary-foreground:#fff`, `--destructive:#c92a1e`, `--border`/`--input:#e5e5df`, `--ring:#2742f5`, `--muted:#f1f1ec`, `--muted-foreground:#787d87`, `--accent:#eef0fe`, `--accent-foreground:#16181d`, `--card:#ffffff`, `--radius:0.5rem` (8px = prototype radius).
- Add C-only tokens in `@theme inline`: `--color-near:#a36a00`, `--color-review:#5b4fc4`, `--color-ok:#1a7a4d`, `--color-faint:#a8adb5`, `--color-sunken:#f1f1ec`, `--color-hair:#e5e5df`, `--color-ink:#16181d`, `--color-accent-strong:#2742f5`, `--color-accent-press:#1c31c8`, `--color-accent-tint:#eef0fe`; fonts `--font-latin: "Space Grotesk", …` (+ keep `--font-sans` as the CJK-first body stack); keyframes `rise`, `swap`, `pulse`, `toast-in` (+ keep `spin` via tw-animate) and `--animate-rise` etc. tokens.
- Base layer: `color-scheme: light`, body 15px/1.75, focus-visible 2px accent, `::selection` tint, number/search input appearance resets (from prototype), global `prefers-reduced-motion` kill switch.
- Delete the `.dark { … }` variable block and `pipeline-flow` keyframes; **keep** the `@custom-variant dark` declaration so any residual `dark:` utility in kept ui files stays class-gated (never activates — no `.dark` class is ever set) instead of falling back to Tailwind's media-query default.
- `@font-face` for Space Grotesk 400/500/700, `src: url(/fonts/space-grotesk-*.woff2)`, `font-display: swap`, self-hosted files in `web/public/fonts/` (no next/font, no external link tags — keeps the repo's CSS-first font convention and avoids a build-time Google dependency).

### 3.2 Kept ui primitives re-skinned

- `ui/button.tsx` — variants re-mapped to C: `default` (primary: 48px min-h, radius 8, accent bg), `hairline` (1px hair border), `text` (tbtn-style); sizes adjusted. All consumers are new code, so variant renames are safe.
- `ui/input.tsx` — underline style (transparent bg, bottom hair border, focus accent underline + 1px shadow).
- `ui/label.tsx` — faint letter-spaced small label.
- `ui/sonner.tsx` — drop `useTheme` (next-themes), hardcode `theme="light"`, position `bottom-center`, `toastOptions` classNames for ink-pill styling, `visibleToasts` small; `richColors`/`closeButton` removed.
- **Deleted after rewrite** (no importers remain): alert, badge, card, dialog, progress, scroll-area, separator, sheet, skeleton, table, tabs.

### 3.3 layout.tsx

Remove `ThemeProvider` import/wrapper and `suppressHydrationWarning`; keep `lang="zh-CN"`, metadata unchanged; `Toaster` stays mounted here with the new position/styling.

## 4. Deletions and dependency changes

- Delete components: `audit-command-center.tsx`, `progress-steps.tsx`, `result-table.tsx`, `result-distribution-chart.tsx`, `history-panel.tsx`, `admin-user-dialog.tsx`, `admin-user-panel.tsx`, `theme-provider.tsx`, `theme-toggle.tsx` + unused ui primitives (§3.2).
- Remove deps: `recharts` (only importer was the distribution chart), `next-themes` (importers: theme-provider/toggle + ui/sonner — all rewritten/removed). Run the dependency-change checklist from the rules digest (grep for imports, full gate suite) before removal; `.trellis/spec/shared/dependency-versions.md` updated in Phase 3.3.
- `lucide-react` version stays; icons used: `X, Search, ChevronDown, LoaderCircle, User` (+ any needed for R3 states, e.g. `TriangleAlert` for processing failure).

## 5. Data flow & failure paths (delta vs current)

Identical request sequence and retry/error mapping as today (see `research/api-contract.md`). Differences:
1. **取消/转入后台** (D2): sets `pollGeneration`++ (stale poll callbacks no-op), `isUploading=false`, screen→submit, toast 已转入后台，可在「历史」中继续查看. Reopening a running job from history re-enters processing screen and restarts `pollStatus`.
2. **Processing failure**: poll `failed` → stay on processing screen in failure state (danger status + job.message + 返回) instead of today's alert-in-tab. Submit-phase failures (session/PUT/submit HTTP errors) → toast with the mapped message + return to submit screen.
3. **Report open from history**: veil while `loadResult` runs; on success screen→report; on error toast + stay.
4. **Reanalyze**: available on report screen (and from history rows like today via opening the report first — prototype only exposes it on the report; history rows keep a lightweight 重新分析 text button to preserve current capability). Veil + sonner loading/success/error with id reuse.
5. Quota refresh points unchanged: after session creation, after submit, after completion/result load, after failures (`refreshCurrentUser` + `refreshHistory`).

## 6. Tradeoffs

- **Re-skin primitives vs bespoke classes**: re-skinning `ui/button|input|label` keeps the "prefer local primitives" spec rule with C's look; everything else in C is bespoke enough that utility-class JSX (Tailwind) is simpler than maintaining unused primitives — hence the deletions.
- **Self-hosted font vs next/font**: CSS-first `@font-face` matches the repo's documented "fonts live in globals.css" approach; adds ~3 small woff2 binaries to `public/`.
- **Screen switcher vs URL routes**: prototype is stateful screens; the app stays a single route (no router changes), matching current tab behavior and auth-reload idiom.
- **Verbatim orchestration port vs hook extraction**: spec says extract hooks only for reuse/testability; single consumer + no component-test infrastructure → colocate in the shell (functions kept top-level-per-file where pure, e.g. `uploadErrorMessage`, progress mapping — unit-testable later without JSX).

## 7. Compatibility / rollout / rollback

- API/binding surface untouched → deploy is a pure Worker asset swap; no migrations, no secret changes.
- SSR shape preserved (page.tsx still server-gates by cookie), so the `/api/auth/me` 401 smoke and auth flows are unaffected.
- Rollback = `git revert` of the frontend commits (no data/schema coupling).
- Risk watch: `npm run cf:build` after dependency removals (OpenNext bundling), and hydration (datetime gating) verified via dev-server screenshot pass with no console errors.

## 8. Verification plan (expanded in implement.md)

1. Gates: `npm run test && npm run lint && npm run build && npm run cf:build`.
2. Visual: headless Chromium screenshots of every screen vs prototype at 1440×900 and 640px (login/submit/processing/report/history/users + toast/veil/failure states), driven against `npm run dev` with a seeded local SQLite user; prototype side served from `designs/` on :4315.
3. Functional walkthrough in dev: real login → upload small real PDF (PaddleOCR token present locally? if not, exercise up to submit and simulate provider states by opening a pre-seeded complete job; full-pipeline validation then happens against production shape in `cf:preview` or after deploy) → report render → search/expand/downloads → reanalyze → history open/resume → admin create/edit/disable → quota note updates → sign-out.
4. Guard: `git diff --stat` confirms zero changes under `web/src/app/api/`, `web/src/lib/`, `web/migrations/`.
