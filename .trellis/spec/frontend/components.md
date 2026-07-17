# Component Guidelines

> UI, routing, and rendering conventions for the `web/` Next.js audit console.

---

## Component Boundaries

Reference structure:

| Area | Path |
| --- | --- |
| App route shell | `web/src/app/page.tsx` |
| Report-flow app shell | `web/src/components/audit/report-flow-app.tsx` |
| Audit screens | `web/src/components/audit/{submit,processing,report,history,users}-screen.tsx` |
| Auth UI | `web/src/components/auth/` |
| shadcn primitives | `web/src/components/ui/` (`button`, `input`, `label`, `sonner`) |

Use Next.js App Router file conventions. New pages or API routes belong under
`web/src/app/`. There is no `routes.ts` registration file in this project.

The app is a single route. `page.tsx` (server component) renders `SignInPanel`
when unauthenticated or `ReportFlowApp` when authenticated. `ReportFlowApp` owns
a client-side screen switcher (`submit | processing | report | history |
users`) — there is no client router. The design is a single light "paper"
theme (`color-scheme: light`); there is no dark mode or theme toggle.

## Server And Client Components

- Keep authentication gate and initial data loading in server components when
  possible.
- Mark interactive components with `"use client"`.
- Keep browser-only APIs (`window`, file inputs, `localStorage`, `setTimeout`)
  inside client components.
- Pass typed initial payloads from server components to client components; avoid
  refetching on first paint when the server already loaded the data.

## UI Primitives

Design C is bespoke enough that most UI is written as Tailwind-utility JSX
against the `globals.css` tokens rather than wrapped primitives. Only four
local shadcn primitives remain in `web/src/components/ui/`:

- `Button` — variants `default` (cobalt primary), `hairline`, `text`.
- `Input` — underline field (transparent, bottom hairline, focus accent).
- `Label` — faint letter-spaced field label.
- `Sonner` `Toaster` — bottom-center ink pill, `theme="light"` (no next-themes).

Before adding a new primitive, check whether a few utility classes on the
existing tokens (`bg-sunken`, `border-hair`, `text-faint`, `num`, `animate-rise`)
already express it. Toasts (via `sonner`) replace the old `Alert` banner pattern
for transient success/error feedback.

Use `lucide-react` icons for recognizable actions. Include `sr-only` labels for
icon-only buttons.

## Report-Flow Layout

The authenticated app is a focused three-beat flow — submit → processing →
report — plus history and admin screens, rendered one screen at a time inside a
centered column (max width 768px for submit/history/users, 888px for report).

- A sticky topbar hosts navigation (新建检查 / 历史 / 用户管理 / 上次报告) and the
  user chip; it is hidden during the processing screen.
- Screens open with the staggered `Rise` container (`animate-rise`, 60ms/index).
- Typography carries the design: the `num` utility (`@utility num` in
  `globals.css`) renders tabular Space Grotesk for all digits/latin display type;
  section colors are the tokens `--destructive` / `--near` / `--review` / `--ok`.
- Keep long filenames, emails, evidence text, and OCR lines wrapping or
  truncating intentionally (`break-all`, scroll containers).

## Task Pipeline

The pipeline is the full-screen processing scene (`processing-screen.tsx`): a
hairline top progress track, a giant eased percentage (rAF easing that honors
`prefers-reduced-motion`), a swapping status line, and a five-dot step
indicator driven by the real `StageState.activeStep`.

- The overall percent maps the pipeline onto a single 0–100 scale (see
  `overallPercent` in `report-flow-app.tsx`): staged client jumps for
  upload/submit, `PaddleOcrProviderProgress.percent` for OCR, analyze/persist
  stages near the end.
- Preserve the staged upload/OCR state machine; progress is presentational.
- There is no cancel API. The processing screen's exit affordance is 转入后台
  (stop polling, return to submit; the job keeps its server-side row and resumes
  polling when reopened from 历史). A failed poll switches the same screen to a
  danger state with a 返回 affordance — no dead-end.

## Evidence Text

Evidence and OCR text often arrive as PaddleOCR markdown-like plain text. Render
it for reading, not as one unbounded line.

Reference helpers:

- `web/src/lib/evidence-text.ts`
- The 字段片段 blockquote and OCR 上下文 line list in
  `web/src/components/audit/report-screen.tsx`

Rules:

- Use `cleanEvidenceText` for the single-line 字段片段 quote.
- Render OCR context as a line array via `evidenceLines` inside a max-height
  scroll container.
- Preserve line breaks in detailed evidence views by rendering line arrays.
- Use `break-words` for long OCR fragments.
- Do not use `dangerouslySetInnerHTML` for OCR/provider text.
- PaddleOCR analyzer rows always have `items: []`; render `row.title` as the
  primary label and show the 书签路径 line only when `row.items?.length` (legacy
  local-python rows).

## Admin Forms

Admin user management is the 用户管理 screen (`users-screen.tsx`), reachable
from the topbar for admins only: a 新增用户 form grid on top and an
inline-editable user list below (borderless name input, underline role/status
selects, quota number fields, usage line, 保存/启用/禁用 text actions).

- Keep numeric quota form values as strings while editing; convert at the API
  boundary (`numberFromInput`).
- Surface create/update results through toasts, not persistent banners.
- Disable self-disable.
- Use server validation as authority; client `min`/`max` inputs are only UI
  affordances.

## Accessibility

- Use semantic buttons for actions.
- Use labels for form controls.
- Provide `aria-expanded` on collapse buttons.
- Keep dialog titles and descriptions meaningful.
- Do not make clickable `div` elements when a button or link is appropriate.

## Do Not Use

- Do not add React Router route registration examples.
- Do not add a separate UI library before checking existing primitives.
- Do not expose provider URLs, tokens, or object storage URLs in persistent UI.
- Do not render untrusted OCR text as HTML.
