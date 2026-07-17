# Refactor Frontend to Design C "Report Flow" (方案C · 报告流)

## Goal

Replace the current cyan-teal admin-console frontend (`AuditCommandCenter` + sidebar workbench) with the Design C "report flow" experience prototyped in `designs/pdf-audit-redesign/` (`report-flow.html` + `app-report.jsx`): a focused three-beat flow — submit → processing → report — with document-style typography, a single cobalt accent, and generous whitespace. All existing functionality must be preserved and wired to the real APIs. Zero backend changes.

## Background

- The user compared three interactive prototypes (案卷 / 指挥舱 / 报告流) served from `designs/pdf-audit-redesign/` (port 4315) and chose 方案C (`report-flow.html`, logic in `app-report.jsx`, shared mock data/simulation in `data.jsx`, icons in `icons.jsx`).
- The prototype is a faithful mock of the real pipeline (upload → PaddleOCR → analyze → report) built on the same result-field vocabulary as `result.json`, but everything in it is simulated (any-credential login, 14s job simulation, sample data, fake quotas).
- Live code is `web/` (Next.js 16 App Router, React 19, Tailwind 4 CSS-first, radix-nova shadcn, deployed via OpenNext to Cloudflare Workers).

## Requirements

### R1 — Screen parity with the prototype

Rebuild these screens to visually and interactionally match `report-flow.html` / `app-report.jsx` (1440px reference; keep the prototype's responsive behavior):

1. **Login** — centered minimal form, wordmark 有效期检查 / EXPIRY AUDIT, staggered rise-in animation, full-width 进入 button. Wired to real `POST /api/auth/login` + `window.location.reload()`; shows real error messages (prototype has none — reuse its typographic language for an error line).
2. **Topbar** — wordmark (click → 新建检查), nav: 新建检查 / 历史 / 用户管理 (admin only) / 上次报告 (only when a complete job exists) / user name + 退出. Hidden during processing.
3. **新建检查 (submit)** — eyebrow + page title, 3-step indicator (01 选择文件 / 02 设定截止日 / 03 开始, current/done states), dropzone (drag & drop + click + keyboard), file row with size + remove, cutoff date input + presets 今天 / +30 天 / +90 天, quota-remaining note, full-width 开始检查 button + contextual hint line.
4. **处理中 (processing)** — top hairline progress track, 正在检查 · filename, giant eased percentage (rAF, `prefers-reduced-motion` honored), status line (swap animation), 5-dot step indicator, cancel affordance (see D2).
5. **报告 (report)** — document layout: eyebrow with job №, verdict headline (发现 N 项证件在截止日前到期, count colored danger/accent), summary sentence, meta line, 4-stat strip with color ticks, proportional distribution bar + legend, search input (filters all sections), four sections 截止日内到期 / 临近到期 / 需要复核 / 已识别有效 with expandable rows (person, cert title, expiry date, 距截止 ±N 天, page, chevron; expanded: 字段片段 quote, OCR 上下文, 书签路径 line, colored reason), downloads row, 重新分析 + 再检查一份 actions.
6. **历史** — list rows: filename, datetime · 截止 date · status (running shows 云端处理中 · X/Y 页), right-aligned counts (命中 N · 复核 N · 页 N), failed rows expand to show the error message, complete rows open the report.
7. **用户管理 (admin)** — 新增用户 form (账号/名称/初始密码/角色/上传上限 MB/OCR 任务数/OCR 页数) + user cards (inline name edit, role/status selects, quota inputs, usage line, 保存 / 启用 / 禁用 actions; self cannot be disabled).
8. **Overlays** — minimal toast (bottom, auto-dismiss), reanalysis veil (正在按最新规则重算…), all matching prototype styling.

### R2 — Real wiring (no simulation left)

- Upload pipeline: `POST /api/audit/cloud-uploads` → PUT to `uploadUrl` (dual mode: worker route or presigned S3, per session response) → `POST /api/audit/cloud-uploads/paddleocr` → poll `GET /api/audit/jobs/{id}/status` every 1.5s → on complete `GET /api/audit/jobs/{id}/result`. Keep the existing retry helper (`fetchWithRetries`) and the existing upload-error message mapping (UPLOAD_SESSION_FAILED / UPLOAD_ALREADY_SUBMITTED / UPLOAD_SESSION_COMPLETED / UPLOAD_SESSION_STALE / presigned-CORS hint).
- Processing percent mapping follows the prototype: upload phase → 0–30, provider running → 30–85 (via provider percent), analyze/persist stages → 85–100; 5-dot indicator driven by the real `StageState.activeStep` (1–5).
- Report data from real `AuditResult` (entries, summary, manifest); 有效 rows derived client-side (candidates − flagged) exactly as the current `ResultTable` derives them.
- Downloads hit the real `GET /api/audit/jobs/{id}/download/{file}` for all four artifacts (`matches.csv`, `result.json`, `ocr.txt`, `paddleocr.jsonl`) — one more than the prototype shows, same visual style.
- 重新分析 calls `POST /api/audit/jobs/{id}/reanalyze` (works from report screen and history), veil overlay while running, toast on completion.
- History from `GET /api/audit/history`; running jobs resume polling when opened.
- Quota note reads the real `currentUser.quota` (usage/limits); refreshed after each pipeline step like today (`/api/auth/me`).
- Admin operations use the real user CRUD APIs with the same payloads the current admin panel sends.
- Keep the RSC shell: `page.tsx` stays an async server component that renders Login (no session) or the app (session) with `initialHistory` + `currentUser`; auth transitions still use `window.location.reload()`.

### R3 — Real-world states the prototype lacks (design extensions, keep C's visual language)

- Processing failure: status line switches to danger tone with the server's Chinese error message and a 返回 action (no dead-end).
- Report loading (opening a complete job from history): veil overlay while `result` fetches.
- Login failure: inline error line under the form.
- Submit-time API errors: toast + return to submit screen with state intact.
- Empty history state.
- 401 handling on polls/loads: same messages as today (请重新登录后…).

### R4 — Technical constraints

- Tailwind 4 CSS-first: new design tokens (paper/ink/cobalt accent/section colors, font stacks, keyframes) live in `web/src/app/globals.css` via `@theme inline`; no tailwind.config, no new dependencies.
- Keep banned-deps rules (no Zod/React Query/etc.); icons from existing `lucide-react`; toasts via existing `sonner` (restyled); remove `recharts` usage (distribution bar is a flex bar) — the dependency itself may be dropped from package.json only if nothing else imports it.
- All user-facing strings in Chinese; timestamps ISO-8601 from APIs formatted like the prototype.
- No `any`, no `!` assertions; client fetches use `cache: "no-store"` + `.json().catch()` payload parsing.
- Old UI components that are no longer referenced (command center, progress steps, result table, distribution chart, history sheet, admin dialog, unused `ui/*` primitives) are deleted, not left dead.
- No changes under `web/src/app/api/`, `web/src/lib/` (except type re-exports if strictly needed), `web/migrations/`.

## Decisions (confirmed at plan review 2026-07-17: start approved; D1 remove dark mode; D2 转入后台)

- **D1 Dark mode**: Design C is a single light paper theme. The theme toggle and dark variants are removed (next-themes stays installed only if still needed by `layout.tsx` plumbing; otherwise removed from the tree). — pending user confirmation
- **D2 取消 semantics**: the real pipeline has no cancel API and is poll-driven. The processing screen's 取消 becomes 转入后台: stop polling, return to 新建检查, job remains visible/resumable in 历史. Hint copy explains this. — pending user confirmation
- **D3 示例文件**: the prototype's 使用示例文件 button is removed (no sample PDF in production). — pending user confirmation
- **D4 Quota copy**: prototype says 本月剩余; quotas actually reset daily (UTC) by design → copy becomes 今日剩余. — pending user confirmation
- **D5 Downloads**: ~~expose all four artifacts~~ REVERSED during review: the download route only allowlists `matches.csv`/`result.json`/`ocr.txt`(/legacy `manifest.json`) — `paddleocr.jsonl` is stored but not downloadable, so the UI exposes exactly the prototype's three files.

## Acceptance Criteria

- [ ] Side-by-side screenshot review (1440×900, headless Chromium) of login / submit / processing / report / history / users against the prototype shows matching layout, typography, spacing, and colors.
- [ ] Full real pipeline exercised in local dev (SQLite fallback): login → upload a real PDF → processing screen advances through the 5 steps → report renders real analyzer output; history reanalyze refreshes the report; admin create/edit works.
- [ ] All R3 states reachable and styled (forced-error walkthrough).
- [ ] `npm run test && npm run lint && npm run build && npm run cf:build` all pass from `web/`.
- [ ] `git diff --stat` shows no changes under `web/src/app/api/`, `web/src/lib/`, or `web/migrations/`.
- [ ] No orphaned/dead frontend components remain (every file under `web/src/components/` is imported somewhere).

## Definition Of Done

- Implementation matches the reviewed `design.md` / `implement.md`.
- Trellis spec (`.trellis/spec/frontend/`) updated where the redesign changes documented conventions (e.g. component inventory, styling tokens).
- Changes committed with focused Chinese commit messages (Phase 3.4 flow).

## Out Of Scope

- Any backend/API/analyzer/quota change.
- Dark mode variant of Design C (removed per D1).
- The other two prototype directions (案卷 / 指挥舱).
- Mobile-first re-layout beyond the prototype's own responsive CSS.
- PWA/print stylesheets beyond what the prototype defines.

## Technical Notes

- Prototype sources: `designs/pdf-audit-redesign/report-flow.html` (CSS), `app-report.jsx` (logic/structure), `data.jsx` (result-field vocabulary + simulation), `icons.jsx`.
- Current orchestration to preserve: `web/src/components/audit/audit-command-center.tsx` (`handleSubmit` → `pollStatus` → `loadResult`, `reanalyzeHistoryJob`, `fetchWithRetries`, `uploadErrorMessage`, quota card math).
- RSC shell: `web/src/app/page.tsx`; auth panel: `web/src/components/auth/sign-in-panel.tsx`.
- Research documents live in `research/` next to this file.
