# PaddleOCR Parsing Progress UI

## Goal

Show PaddleOCR's real third-party parsing progress in the audit interface so users can see whether the OCR provider is queued, running, completed, or failed, and how many PDF pages have been parsed when PaddleOCR exposes page progress.

Also improve the upload-to-result interaction so users can distinguish upload,
provider parsing, report generation, and result review without losing context,
and make multi-tab result browsing easier after the report is available.

## What I Already Know

- The current production UI shows an internal task pipeline with a coarse percent such as `86%`.
- The current pipeline percent is derived from local workflow stage position, not from PaddleOCR's actual page progress.
- `web/src/lib/paddleocr.ts` already parses PaddleOCR status responses into `providerState`, `totalPages`, `extractedPages`, `startTime`, `endTime`, `jsonUrl`, and `errorMessage`.
- `parsePaddleOcrJobSnapshot` already builds messages such as `PaddleOCR 正在解析：17/225 页`.
- `web/src/app/api/audit/jobs/[id]/status/route.ts` already polls PaddleOCR and currently returns `snapshot` in the JSON response.
- `web/src/components/audit/audit-command-center.tsx` polls the status route and stores only the coarse `stage`.
- `web/src/components/audit/progress-steps.tsx` renders the pipeline and does not expose a dedicated third-party OCR progress section.
- The current frontend already has early provider-progress plumbing, but the
  overall headline percent can still jump to a coarse `86%` after upload, which
  makes long PaddleOCR parsing look closer to completion than it really is.
- `web/src/components/audit/result-table.tsx` already uses result-category tabs
  for `matches`, `near`, `valid`, `review`, and `all`.
- The workbench-level result area is still a linear stack: task pipeline,
  collapsible overview, then result tabs. Users who are checking multiple result
  categories and history records need a clearer tabbed navigation surface.

## Requirements

- Preserve the existing task pipeline as the overall workflow progress.
- Add a structured provider progress payload for PaddleOCR status polling instead of relying on the frontend to interpret a raw provider snapshot.
- Display a dedicated PaddleOCR progress section within the task pipeline card when the active or selected job is a PaddleOCR job and provider progress exists.
- Show provider state clearly:
  - `pending`: queued/waiting for PaddleOCR processing.
  - `running`: actively parsing.
  - `done`: third-party parsing completed.
  - `failed`: third-party parsing failed, with the available error message.
- When `totalPages` and `extractedPages` are available, show page progress as `extractedPages / totalPages` and a calculated percent.
- When page counts are not available yet, show an indeterminate/waiting state without inventing a fake percent.
- Reset provider progress when starting a new upload or switching to history/result views where provider progress is no longer relevant.
- Keep the UI compact and consistent with the current task pipeline card.
- Show upload, submission, provider parsing, report generation, and result-ready
  states as distinct progress signals.
- Avoid showing a misleading high overall percent while PaddleOCR parsing is
  still queued or running and provider page counts are unknown.
- Add a workbench-level tab/switcher for the main review surfaces so users can
  move between progress, overview, result categories, and history without
  hunting through a long page.
- Preserve the existing result-category tabs inside the result view; the
  workbench-level tabs should not remove the detailed `matches / near / valid /
  review / all` result classification.
- History should remain accessible from the existing drawer action, and may also
  be surfaced as a workbench tab if that keeps active and archived tasks easier
  to compare.

## Proposed API Shape

```ts
type ProviderProgress = {
  provider: "paddleocr"
  state: "pending" | "running" | "done" | "failed"
  totalPages: number | null
  extractedPages: number | null
  percent: number | null
  startedAt: string | null
  endedAt: string | null
  message: string
}
```

## Acceptance Criteria

- [ ] During PaddleOCR `pending`, the UI shows that PaddleOCR is queued/waiting.
- [ ] During PaddleOCR `running` with page counts, the UI shows page progress such as `17 / 225 页` and a matching percent.
- [ ] During PaddleOCR `running` without page counts, the UI shows a waiting/indeterminate status rather than a misleading number.
- [ ] During PaddleOCR `done`, the UI shows completion state.
- [ ] During PaddleOCR `failed`, the UI shows failure state and available error text.
- [ ] Uploading a PDF shows a clear upload-state progress message before OCR submission.
- [ ] Overall progress does not jump to a misleading near-complete percent solely because the PDF upload finished.
- [ ] The workbench exposes clear tabs for progress, overview, results, and history/result navigation.
- [ ] The detailed result table still supports category tabs and defaults to the most actionable non-empty category.
- [ ] Existing upload, polling, result loading, history loading, and quota behavior remain unchanged.
- [ ] Existing tests continue to pass, and focused tests cover provider progress mapping where practical.

## Definition of Done

- Tests added or updated for provider progress mapping.
- Lint and relevant test/build commands pass.
- No new dependency unless proven necessary.
- Changes are committed under this task before finish-work.
- Production deployment can proceed after merge if the user requests or confirms deployment.

## Out of Scope

- Changing PaddleOCR model, token handling, polling interval, or quota policy.
- Replacing the current task pipeline.
- Implementing background push notifications, WebSocket/SSE, or long-lived server polling.
- Changing object storage, D1 schema, or OCR result analysis logic.

## Technical Notes

- Primary backend files likely involved:
  - `web/src/lib/paddleocr.ts`
  - `web/src/app/api/audit/jobs/[id]/status/route.ts`
- Primary frontend files likely involved:
  - `web/src/components/audit/audit-command-center.tsx`
  - `web/src/components/audit/progress-steps.tsx`
- Existing tests to extend:
  - `web/src/lib/__tests__/paddleocr.test.ts`
- This enhancement should use the existing polling mechanism. It does not require a new external API call.
