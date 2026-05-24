# Centered Animated Task Pipeline

## Goal

Move the task pipeline from the left sidebar into the main audit content area and present it as a centered horizontal progress module with lightweight animation. The change should improve visibility of the PDF processing state without changing the upload/OCR state machine or backend contracts.

## Feasibility Analysis

This is feasible as a frontend-only task.

- The current pipeline state already lives in `AuditCommandCenter` as `stage`, `currentJob`, and `progressPercent`.
- `ProgressSteps` is a presentational component that receives only `stage`, so it can be adapted to a horizontal layout without backend changes.
- The current sidebar pipeline competes with upload controls for vertical space; the main content area has enough width for a centered pipeline module.
- The existing staged state machine, polling, current job loading, upload quota refreshes, and history behavior do not need to change.

The primary risks are UI-specific:

- Mobile screens must not overflow horizontally.
- Animation must not shift layout or obscure text.
- Failed and complete states must remain clear and accessible.
- The module should stay operational and dense, not become a marketing-style hero.

## Requirements

- Move the "任务流水线" module out of the sidebar and into the right/main content area.
- Center the pipeline module horizontally in the main page.
- Present the pipeline steps horizontally on desktop.
- Keep mobile/tablet layouts readable without horizontal overflow.
- Add lightweight animation for active/running progress and state transitions.
- Preserve current filename, cutoff, status message, and progress percent display.
- Preserve existing upload, OCR polling, history, and result behavior.
- Do not introduce new backend/API contracts or new dependencies.

## Acceptance Criteria

- [x] The sidebar no longer contains the task pipeline card.
- [x] The main content area contains a centered "任务流水线" module near the top of the page.
- [x] Desktop layout displays the five pipeline steps horizontally.
- [x] Small screens gracefully wrap or stack without text overlap or horizontal scrolling.
- [x] Active step has an animated visual indicator.
- [x] Progress bar shows animated flow while a task is running.
- [x] Done, active, waiting, and failed states remain visually distinct.
- [x] Current job filename, cutoff, status message, and percent remain visible.
- [x] No upload/OCR/API behavior changes are introduced.

## Definition Of Done

- Frontend specs are followed.
- `npm run test`, `npm run lint`, `npm run build`, and `npm run cf:build` pass from `web/`.
- Trellis task records the implementation scope and verification.
- Work is committed on a `codex/` branch.

## Out Of Scope

- New animation libraries.
- Backend/API changes.
- Changing upload/OCR polling behavior.
- Deploying to production unless explicitly requested after verification.

## Technical Notes

- Primary files:
  - `web/src/components/audit/audit-command-center.tsx`
  - `web/src/components/audit/progress-steps.tsx`
- Existing `Progress`, `Badge`, `Card`, and lucide icons should be reused.
- Use CSS/Tailwind animations only.
- Keep the operational audit-console style: dense, readable, and stable.

## Verification

- `npm run test` passed from `web/`.
- `npm run lint` passed from `web/`.
- `npm run build` passed from `web/`.
- `npm run cf:build` passed from `web/`.
- `git diff --check` passed from the repository root.
- Local dev server returned `HTTP/1.1 200 OK` for `http://localhost:3000`.
