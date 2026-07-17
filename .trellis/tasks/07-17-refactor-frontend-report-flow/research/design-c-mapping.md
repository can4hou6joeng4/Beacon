# Design C ↔ Real System Mapping (research)

First-hand sources read in full: `designs/pdf-audit-redesign/{report-flow.html,app-report.jsx,data.jsx,icons.jsx}` (prototype), `web/src/components/audit/{audit-command-center,result-table,admin-user-panel,history-panel}.tsx`, `web/src/components/auth/sign-in-panel.tsx`, `web/src/app/{page,layout}.tsx`, `web/src/app/globals.css`, `web/src/lib/audit-types.ts`. See also `research/api-contract.md` and `research/frontend-coding-rules.md`.

## 1. Design tokens (from report-flow.html `:root`)

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#fafaf7` | page background (warm paper) |
| `--surface` | `#ffffff` | file row background |
| `--sunken` | `#f1f1ec` | quote blocks, disabled primary btn, proc track |
| `--hair` | `#e5e5df` | hairline borders (rows, inputs, separators) |
| `--line-strong` / `--text` | `#16181d` | ink; section head rule; toast background |
| `--muted` | `#787d87` | secondary text |
| `--faint` | `#a8adb5` | tertiary text, labels |
| `--accent` | `#2742f5` | cobalt — the single accent |
| `--accent-press` | `#1c31c8` | hover/pressed |
| `--accent-tint` | `#eef0fe` | selection, pill active bg, drop hover bg |
| `--danger` | `#c92a1e` | 截止日内到期 |
| `--near` | `#a36a00` | 临近到期 |
| `--review` | `#5b4fc4` | 需要复核 |
| `--ok` | `#1a7a4d` | 已识别有效 |
| `--font-latin` | `"Space Grotesk", "PingFang SC", sans-serif` | `.num` class: digits/latin, tabular-nums + tnum |
| `--font-cjk` | `-apple-system, "PingFang SC", "Noto Sans SC", sans-serif` | body |

Other system facts: `color-scheme: light` (light-only design); body 15px / line-height 1.75; focus-visible = 2px accent outline offset 2; `::selection` accent-tint; number inputs strip spinners; search inputs strip cancel button.

Keyframes: `rise` (translateY 12px→0 + fade, .55s cubic-bezier(.22,.61,.21,1)) via `.rv` + per-element `animationDelay = i*60ms` ("Rise" component); `swap` (5px rise, .38s) for status line changes; `spin` .9s linear; `pulse` (accent box-shadow ring 0→7px, 1.6s) for current dot; `toast-in`. Global `prefers-reduced-motion: reduce` kills all animation/transition.

Layout: `.col` = `margin auto; padding 72px 24px 128px`; content widths 768px (submit/history/users) and 888px (report). Topbar: sticky, 60px, bg = paper, hairline bottom border, inner max-width 1128px. Breakpoint 640px: tighter padding, stat strip 2-col, wrapping rows, wordmark-en hidden, uform-grid 1-col.

Key component styling (rebuild with Tailwind utilities + tokens):
- `.btn` 48px min-height, radius 8, weight 600; primary = accent bg/white, hover accent-press, active translateY(1px), disabled sunken/faint; `.btn-hairline` = 1px hair border, hover border ink.
- `.pill` 40px, radius 999, hair border; active = accent border/text + tint bg.
- Inputs are underline-style: no box border, 1px bottom hair border, focus bottom accent + 1px shadow; date input 52px min-height font-size 22.
- `.drop` 300px min-height, 1.5px dashed hair, radius 8; hover/over = accent border + tint bg.
- Processing: fixed 2px top track (sunken) with accent fill (width transition .25s linear); pct `clamp(96px,15vw,120px)` weight 700 tracking −0.045em accent color; 5 dots 8px, done/current accent (current pulses); cancel = faint text button, hidden (visibility) when done.
- Report: verdict `clamp(30px,4.6vw,44px)`; stat-num 42px; dist bar 6px high flex with 3px gaps, segments `flex-grow: count`, min-width 6px, radius 99; section head = 10px gap, bottom border 1px **ink** (not hair); rows separated by hair borders; expand = CSS grid `grid-template-rows 0fr→1fr` transition .3s; quote block = sunken bg radius 8 padding 14/18; context block max-height 132px scroll.
- History list: top border ink; rows = baseline-justified, name 15.5 semibold, meta 13 faint, counts right nowrap; failed detail = danger text, `swap` animation.
- Users: form grid 3-col gap 24/28; user cards separated by hair borders, padding 28px 0; name = borderless inline input (hover shows hair underline); quota inputs width 110.
- Toast: fixed bottom 36px centered, ink bg, paper text, radius 999, padding 12/24, shadow, `toast-in`.
- Veil (reanalysis): fixed inset-0, `rgba(250,250,247,.9)`, centered column, accent spinner, 17px semibold line + 13.5px muted sub.

## 2. Screen ↔ component ↔ API mapping

| Prototype screen (app-report.jsx) | New component | Real wiring |
|---|---|---|
| `LoginScreen` | restyled `SignInPanel` (`components/auth/sign-in-panel.tsx`) | `POST /api/auth/login` `{username, password}` → reload; error line inline (401 `INVALID_CREDENTIALS` etc.) |
| `Topbar` | part of new app shell | nav = client state; 上次报告 shown when latest complete job exists; 退出 → `POST /api/auth/logout` + reload |
| `SubmitScreen` | `submit-screen.tsx` | file staged in state (name+size+File); cutoff presets computed client-side (today/+30/+90); quota note from `currentUser.quota` (今日剩余, see D4); 开始检查 → pipeline start |
| `ProcessingScreen` | `processing-screen.tsx` | driven by pipeline state in shell: upload %, `StageState`, `PaddleOcrProviderProgress`; rAF-eased display percent (prototype algorithm: `d += (target-d)*0.07`, floor, reduced-motion jumps) |
| `ReportScreen` | `report-screen.tsx` | data = `GET /api/audit/jobs/{id}/result` payload `{job, result, distribution}`; downloads = 4 real artifacts; 重新分析 → reanalyze endpoint; 再检查一份 → reset to submit |
| `HistoryScreen` | `history-screen.tsx` | `GET /api/audit/history` → `{jobs: AuditHistoryJob[]}`; complete rows → load result + open report; running rows → open processing view (resume polling); failed rows → expand message |
| `UsersScreen` | `users-screen.tsx` | `GET/POST /api/admin/users`, `PATCH /api/admin/users/{id}` — reuse exact payload builders from current `admin-user-panel.tsx` (`CreateUserInput` with quota in bytes, string form state, `numberFromInput`) |
| toast | sonner restyled (bottom-center ink pill) | keep `toast.loading/success/error` id-reuse for reanalysis |
| veil | small overlay component in shell | reanalysis in-flight + report loading from history |

## 3. Pipeline progress mapping (prototype `startRun` — keep exactly)

Overall percent (single number driving track + giant display):
- Upload phase: `target = uploadPercent * 0.3` (0–30). Real app has no per-byte upload progress (single `fetch` PUT) — use the current command center's staged jumps (18 after session, 34 after PUT, 42 after submit) scaled: session created → 6, PUT done → 30, submit done → 36. Simpler faithful choice: map the existing `workflowProgressPercent` inputs onto prototype ranges: stage1 → ≤30, stage2 → 30–36, provider pending → 38, provider running → `30 + percent*0.55` (30–85), provider done → 85, stage4 → 88, stage5 → 94, complete → 100.
- Status line = client stage labels during steps 1–2 (正在创建上传会话 / 正在上传 PDF 到对象存储 / 正在提交 PaddleOCR 任务), then server `providerProgress.message` (e.g. `PaddleOCR 解析中 · 已解析 X/Y 页` — prototype composes this from extractedPages/totalPages when running) or `stage.label`.
- 5-dot indicator = `StageState.activeStep` (client-set 1–2 pre-submit, then server values 1/3/5; server never reports 2 or 4 — dots still render correctly since dots < activeStep are "done").
- Server StageState per api-contract: queued→{1}, running→{3}, complete→{5,complete}, failed→{3,failed}.

## 4. Report row rendering — items is ALWAYS `[]` for PaddleOCR rows

`research/api-contract.md`: the PaddleOCR analyzer emits `items: []` and **no `manifest`**. The prototype leans on `items[0].person` / `.bookmark` / `.person_index` / `.start_page/.end_page` (mock data was modeled on the legacy local-python shape). Real rendering rules (mirror current `ResultTable`):
- Row primary label: `items[0]?.person` when present, else `row.title`; secondary (muted cert name): `items[0]?.bookmark || row.title` only when a person exists (avoid duplicating title).
- Expanded 书签路径 line: render **only** when `row.items?.length` (legacy rows).
- Search haystack: page, title, expiry_date, reason, field_context, context, items fields (as `rowSearchText` today).
- Evidence: use `cleanEvidenceText` / `evidenceLines` from `@/lib/evidence-text` for 字段片段 / OCR 上下文 blocks (do NOT render raw with dangerouslySetInnerHTML).
- 有效 rows derivation (client): `result.candidates.filter(r => r.expiry_date && !flagged.has(rowKey(r)))` with flagged = matches+near_expiry keys — exactly `ResultTable`'s `rowKey`/`valid` memo. Do not use the server `distribution` 有效 value for section rows (it also subtracts needs_review); section counts come from row arrays, the distribution bar uses the same section counts (prototype behavior).
- 距截止 ±N 天: `Math.round((Date(expiry) - Date(cutoff))/86400000)`; null expiry → 待复核; `长期` expiry_date value must be special-cased (never expires → render 长期, no day delta).
- Report meta line: `job.filename · 截止日期 {summary.cutoff} · 完成于 {formatDateTime(completedAt||updatedAt)} · OCR 覆盖 {summary.pages_ocr}/{summary.ocr_total_pages} 页` (no manifest).

## 5. Real-world gaps the prototype ignores (design extensions)

1. **Processing failure**: real `stage.failed` / job.status `failed` mid-poll. Design: status line turns `--danger`, shows `job.message`/error, dots freeze, cancel button becomes 返回; track fill stops. Also submit-phase failures (session/PUT/submit errors) → toast + back to submit screen (state preserved).
2. **No cancel API**: 取消 → stop polling + return to submit (job keeps running server-side only while polled; it resumes when reopened from 历史). Copy: 转入后台，可在「历史」中继续查看.
3. **Report loading from history**: veil (正在读取报告…) while result fetches; 401 → 请重新登录后读取历史结果.
4. **Login errors**: inline danger text under form (INVALID_CREDENTIALS → server 中文 message).
5. **Hydration-safe datetimes**: history/report show `MM-DD HH:mm` local times; page renders on the server first (RSC pass of client components) → server/client timezone mismatch risk. Use a mounted gate (the `useSyncExternalStore` idiom from theme-toggle.tsx) around formatted datetimes, rendering a stable placeholder (e.g. the raw date part) before mount.
6. **Empty history**: 暂无检查记录 line in faint, consistent with `.rsec-empty` styling.
7. **Quota exceeded / API error codes**: show `payload.error` verbatim (they are user-appropriate Chinese); keep `fetchWithRetries` 5xx-only retry; never retry 4xx.
8. **`unknown` status + legacy `local-python` rows** in history: statusLabel map includes 未知; rows with `runtime !== "paddleocr"` or missing `providerJobId` are not openable (render non-clickable, as current `canOpen` logic).

## 6. Icon mapping (prototype → lucide-react)

XIcon→`X`, SearchIcon→`Search`, ChevronDownIcon→`ChevronDown`, LoaderIcon→`LoaderCircle` (or `Loader2` alias) with `animate-spin`-equivalent custom `.spin`, UserIcon→`User`. All prototype icons are lucide-style strokes (1.9 width ≈ lucide default 2 — acceptable).

## 7. Files plan (target tree under web/src)

- `app/globals.css` — replace palette with Design C tokens (keep shadcn variable names mapped where primitives remain: `--background:#fafaf7`, `--foreground:#16181d`, `--primary:#2742f5`, `--destructive:#c92a1e`, `--border/--input:#e5e5df`, `--ring:#2742f5`, `--muted`, `--muted-foreground:#787d87`, `--accent(-tint)` etc.) + add C-only tokens (`--color-near`, `--color-review`, `--color-ok`, `--color-sunken`, `--color-faint`, `--color-ink`, `--color-accent-tint`), font tokens (`--font-latin` Space Grotesk stack; body stays CJK-first), keyframes (rise/swap/pulse/toast-in; keep spin), `color-scheme: light`, reduced-motion rule, number/search input resets. Keep `@custom-variant dark` declared (class-based) so leftover `dark:` classes in kept ui primitives can never activate via media query; delete the `.dark { … }` value block.
- `app/layout.tsx` — drop ThemeProvider + suppressHydrationWarning; Toaster → bottom-center restyled; add Space Grotesk `@font-face` via self-hosted woff2 in `web/public/fonts/` (declared in globals.css, no next/font, no external link tags — CSS-first per repo convention).
- `app/page.tsx` — unchanged shape; renders `SignInPanel` or new `ReportFlowApp` with `initialHistory` + `currentUser` (initialResult stays null-passthrough or is dropped from props).
- `components/auth/sign-in-panel.tsx` — rewritten to C login (logic kept).
- `components/audit/report-flow-app.tsx` — shell: screen state, topbar, toast/veil hosts, pipeline orchestration (handleSubmit/pollStatus/loadResult/reanalyze/fetchWithRetries/uploadErrorMessage/refreshHistory/refreshCurrentUser — ported verbatim from audit-command-center where possible).
- `components/audit/{submit-screen,processing-screen,report-screen,history-screen,users-screen}.tsx` + `components/audit/rise.tsx` (stagger container) + small shared helpers file `components/audit/report-format.ts` (formatBytes/formatDateTime/daysFromCutoff/statusLabel — client-display helpers).
- **Delete**: `audit-command-center.tsx`, `progress-steps.tsx`, `result-table.tsx`, `result-distribution-chart.tsx`, `history-panel.tsx`, `admin-user-dialog.tsx`, `admin-user-panel.tsx` (superseded by users-screen; port its payload logic), `theme-provider.tsx`, `theme-toggle.tsx`, and now-unused `ui/*` primitives (audit after rewrite: expected removals — card, tabs, table, sheet, dialog, alert, badge, progress, separator; keep button/input/label only if re-skinned and still used; keep `ui/sonner.tsx`).
- **Dependencies**: remove `recharts` + `next-themes` from package.json (verify no remaining imports first; update `.trellis/spec/shared/dependency-versions.md` in Phase 3.3).
- **Untouched**: everything under `web/src/app/api/`, `web/src/lib/` (evidence-text, audit-types, auth-types, audit-progress, paddleocr types are imported read-only), `web/migrations/`, `wrangler.jsonc`, `next.config.ts`.

## 8. Spec sections that must be updated in Phase 3.3 (they describe the old design)

- `frontend/components.md` "Audit Console Layout" (dense sidebar console → focused report-flow), "Task Pipeline" (sidebar/stepper → full-screen processing), "Admin Forms" (dialog-from-command-button → dedicated nav screen), "UI Primitives" (Tabs/Card/Sheet/Dialog usage shrinks).
- `.trellis/spec/shared/dependency-versions.md` (recharts/next-themes removal; Space Grotesk self-hosted font).
- `frontend/index.md` examples list (component names change).
