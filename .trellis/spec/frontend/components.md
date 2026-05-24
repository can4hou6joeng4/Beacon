# Component Guidelines

> UI, routing, and rendering conventions for the `web/` Next.js audit console.

---

## Component Boundaries

Reference structure:

| Area | Path |
| --- | --- |
| App route shell | `web/src/app/page.tsx` |
| Audit workbench | `web/src/components/audit/` |
| Auth UI | `web/src/components/auth/` |
| Theme toggle | `web/src/components/theme-toggle.tsx` |
| shadcn primitives | `web/src/components/ui/` |

Use Next.js App Router file conventions. New pages or API routes belong under
`web/src/app/`. There is no `routes.ts` registration file in this project.

## Server And Client Components

- Keep authentication gate and initial data loading in server components when
  possible.
- Mark interactive components with `"use client"`.
- Keep browser-only APIs (`window`, file inputs, `localStorage`, `setTimeout`)
  inside client components.
- Pass typed initial payloads from server components to client components; avoid
  refetching on first paint when the server already loaded the data.

## UI Primitives

Prefer the existing local shadcn primitives in `web/src/components/ui/`:

- `Button` for commands and icon buttons
- `Card` for repeated entities, forms, and bounded tool panels
- `Dialog` for record details
- `Tabs` for result categories
- `Badge` for statuses and counts
- `Alert` for blocking errors
- `Progress` for upload/OCR progress

Use `lucide-react` icons for recognizable actions. Include `sr-only` labels for
icon-only buttons.

## Audit Console Layout

The first screen is the usable audit console, not a landing page.

Current layout:

- Left sidebar: account/quota and upload controls.
- Main area: headline, history button, centered task pipeline, audit overview,
  result table.
- Dialogs: history browser, evidence details, and admin user management.

Keep operational UIs dense and scannable:

- Avoid oversized marketing hero sections.
- Avoid nesting cards inside cards unless the nested card is a repeated result
  metric or bounded record item.
- Use stable grid dimensions for tables, tabs, quota fields, and progress areas.
- Ensure long filenames, emails, evidence text, and OCR lines wrap or truncate
  intentionally.

## Task Pipeline

The task pipeline belongs in the main audit content area, centered near the top
of the page. It should show upload/OCR progress as a horizontal stepper on
desktop and collapse into readable grid rows on smaller screens.

- Keep the sidebar focused on account/quota and upload controls.
- Preserve the existing staged upload/OCR state machine; pipeline changes should
  be presentational unless a task explicitly changes behavior.
- Use lightweight CSS/Tailwind animations for the active step and running
  progress only.
- Prevent animation from changing layout dimensions or hiding text.
- Keep done, active, waiting, and failed states distinct.

## Evidence Text

Evidence and OCR text often arrive as PaddleOCR markdown-like plain text. Render
it for reading, not as one unbounded line.

Reference helpers:

- `web/src/lib/evidence-text.ts`
- `EvidencePreview` and `ReadableTextBlock` in
  `web/src/components/audit/result-table.tsx`

Rules:

- Use cleaned evidence text for table previews.
- Use clamped previews in tables.
- Use scrollable blocks in dialogs for long text.
- Preserve line breaks in detailed evidence views by rendering line arrays.
- Use `break-words` for long OCR fragments.
- Do not use `dangerouslySetInnerHTML` for OCR/provider text.

Example:

```tsx
function ReadableTextBlock({ text }: { text: string }) {
  const lines = evidenceLines(text)
  return (
    <div className="overflow-y-auto rounded-md border bg-muted/40 p-3">
      {(lines.length > 0 ? lines : ["无内容"]).map((line, index) => (
        <p key={`${line}-${index}`} className="break-words leading-6">
          {line}
        </p>
      ))}
    </div>
  )
}
```

## Admin Forms

Admin user management belongs in an admin-only dialog opened from a compact
command button, not in the always-visible sidebar. The sidebar should stay
focused on the audit workflow: account/quota, upload controls, and pipeline
state.

- Use a wider responsive grid for quota fields so labels and inputs fit without
  relying on sidebar scrolling.
- Show quota boundary summary near quota inputs.
- Keep refresh/save/enable/disable actions as explicit buttons with icons.
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
