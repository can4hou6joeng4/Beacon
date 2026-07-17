# Implementation Plan — Refactor Frontend to Design C "Report Flow"

Execution order is chosen so the app builds/renders at every checkpoint. Run all commands from `web/`. Full gate = `npm run test && npm run lint && npm run build && npm run cf:build`.

## Step 0 — Preconditions

- [ ] Working tree: confirm no unrelated dirty files under `web/` before starting (`git status --porcelain web/`). The known dirty files in the repo root (`.agents/`, `.codex/`, `.trellis/` platform files) are pre-existing and stay untouched.
- [ ] Download Space Grotesk 400/500/700 `woff2` into `web/public/fonts/` (from Google Fonts static files). If network-blocked, fall back to declaring the font stack only (system fallback) and record the gap in the task journal — do not add next/font or a `<link>` tag.

## Step 1 — Visual foundation (app still renders old UI)

- [ ] `globals.css`: new palette values on existing shadcn variable names + C-only tokens + fonts (`--font-latin`, `@font-face`) + keyframes (`rise/swap/pulse/toast-in`) + base rules (`color-scheme: light`, 15px/1.75 body, focus-visible, selection, input appearance resets, reduced-motion kill). Delete `.dark` value block + `pipeline-flow`; keep `@custom-variant dark` declaration.
- [ ] Re-skin `ui/button.tsx` (variants: default/hairline/text per design §3.2), `ui/input.tsx` (underline), `ui/label.tsx` (faint letter-spaced).
- [ ] Rewrite `ui/sonner.tsx` without next-themes (`theme="light"`, ink-pill classNames); update `layout.tsx` (drop ThemeProvider + suppressHydrationWarning; Toaster → `position="bottom-center"`).
- [ ] Checkpoint: `npm run build` passes (old components may look broken visually — acceptable mid-flight; they compile because variable names are preserved).

## Step 2 — Shared pieces

- [ ] `components/audit/rise.tsx` (stagger container), `components/audit/report-format.ts` (formatBytes/formatDateTime/daysFromCutoff/statusLabel), `LocalDateTime` mounted-idiom component (may live in `report-format.tsx` file or own file).
- [ ] Checkpoint: `npm run lint`.

## Step 3 — Login

- [ ] Rewrite `components/auth/sign-in-panel.tsx` to prototype login (logic untouched; inline error line).
- [ ] Checkpoint: dev server → login screen matches prototype; wrong password shows server message; correct login reloads into (old) workbench.

## Step 4 — Shell + screens (the big step)

- [ ] `components/audit/report-flow-app.tsx`: port orchestration verbatim from `audit-command-center.tsx` (fetchWithRetries, uploadErrorMessage, refreshCurrentUser/refreshHistory, handleStart, pollStatus + pollGeneration guard, loadResult, reanalyzeJob, handleSignOut, openHistoryJob), add screen switcher + topbar + veil + overall-percent mapping (design §2.1, mapping research §3).
- [ ] `submit-screen.tsx`, `processing-screen.tsx` (incl. failure state + 转入后台), `report-screen.tsx` (row rules from mapping research §4 — items-empty handling, 长期, evidence via `@/lib/evidence-text`, 4 download links), `history-screen.tsx`, `users-screen.tsx` (port AdminUserPanel payload logic exactly).
- [ ] Switch `page.tsx` to render `ReportFlowApp` (drop `initialResult` prop).
- [ ] Checkpoint: `npm run build` + dev-server walkthrough of every screen with seeded local data.

## Step 5 — Deletions + dependency cleanup

- [ ] Delete: `audit-command-center.tsx`, `progress-steps.tsx`, `result-table.tsx`, `result-distribution-chart.tsx`, `history-panel.tsx`, `admin-user-dialog.tsx`, `admin-user-panel.tsx`, `theme-provider.tsx`, `theme-toggle.tsx`.
- [ ] Delete unused ui primitives (verify zero importers first: `grep -rl "components/ui/<name>\"" src/`): alert, badge, card, dialog, progress, scroll-area, separator, sheet, skeleton, table, tabs.
- [ ] `grep -rn "recharts\|next-themes" src/` → must be empty → remove both from `package.json` + `npm install` (lockfile update).
- [ ] Checkpoint: full gate (`test && lint && build && cf:build`).

## Step 6 — Verification pass (acceptance criteria from prd.md)

- [ ] Seed local dev (SQLite): bootstrap admin via `POST /api/auth/bootstrap` with a local `AUTH_BOOTSTRAP_TOKEN` (dev env), or reuse existing `web/data/audit.sqlite` user.
- [ ] Headless-Chromium screenshot suite: login / submit (empty + file chosen) / processing (in-flight + failure) / report (top + expanded row + search) / history / users, at 1440×900 + 640px; side-by-side vs prototype pages on :4315. Zero console errors/hydration warnings.
- [ ] Functional walkthrough per design §8.3 (as far as local PaddleOCR credentials allow; record what was exercised where).
- [ ] `git diff --stat` — no changes under `web/src/app/api/`, `web/src/lib/`, `web/migrations/`.
- [ ] Full gate one final time.

## Step 7 — Trellis wrap-up (Phase 3)

- [ ] Spec updates (Phase 3.3): `frontend/components.md` (layout/pipeline/admin sections), `frontend/index.md` (examples), `shared/dependency-versions.md` (recharts/next-themes removal, self-hosted font). English.
- [ ] Commit plan (Phase 3.4): logical batches, Chinese subjects, e.g. `feat: 前端重构为方案C报告流` (+ separate `chore:` for dep removal if cleaner); present plan for one-shot confirmation.

## Rollback points

- After Step 1/3/4 checkpoints: `git checkout -- web/src` restores cleanly (no commits yet).
- After commits: revert the frontend commits; no data/schema coupling.

## Explicitly out of scope during implementation

- Any file under `web/src/app/api/`, `web/src/lib/`, `web/migrations/`, `wrangler.jsonc`, `next.config.ts`.
- Deploy (`cf:deploy`) — separate decision after review.
