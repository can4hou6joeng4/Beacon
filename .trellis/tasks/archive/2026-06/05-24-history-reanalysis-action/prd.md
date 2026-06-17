# History Reanalysis Action

## Goal

Allow users to re-run the latest certificate-expiry analysis rules against an existing completed history record without re-uploading the PDF or submitting a new PaddleOCR job.

## What I Already Know

- History records are shown in `web/src/components/audit/history-panel.tsx`.
- Completed PaddleOCR jobs persist artifacts in R2 beside the original object key:
  - `paddleocr.jsonl`
  - `ocr.txt`
  - `matches.csv`
  - `result.json`
- `web/src/app/api/audit/jobs/[id]/result/route.ts` currently loads saved `result.json`.
- `web/src/app/api/audit/jobs/[id]/status/route.ts` creates these artifacts after PaddleOCR completes.
- `web/src/lib/audit-analyzer.ts` can re-run analysis from PaddleOCR JSONL through `analyzePaddleOcrJsonl`.
- Recent analyzer improvements changed certificate/date interpretation, so older history results can become stale unless re-analyzed.
- The project owner does not want `.trellis/**` committed or pushed as part of business-code changes.
- Screenshot review on 2026-05-24 showed that re-analysis currently lacks a visible global confirmation path: the only busy state is inside the history drawer row, the drawer closes after success, and the root layout has not mounted the existing `sonner` toaster component.
- The same screenshot still showed `# 项目评审结论表` in the result table. The likely cause is that the analyzer currently uses page-level certificate detection, so a non-certificate review table can be scanned if the same OCR page also contains certificate-related words elsewhere.

## Requirements

- Add a history action that lets users re-analyze an existing completed PaddleOCR job.
- The first version must re-use already saved OCR/provider artifacts and must not call PaddleOCR again.
- The action must not create a new audit job.
- The action must not consume OCR job quota or OCR page quota.
- The action must not consume upload quota.
- Re-analysis should use the job's existing cutoff date.
- Re-analysis should update saved result artifacts so later history/result reads see the refreshed analysis.
- Re-analysis should update the audit job summary fields in D1/SQLite through existing audit DB methods.
- The UI should show a clear loading state while a history record is being re-analyzed.
- After re-analysis succeeds, the UI should open the refreshed result, refresh history, and refresh current user quota/status.
- Errors should be shown through the existing user-facing error alert pattern.
- Re-analysis should provide a user-visible interaction trail outside the history drawer:
  - immediate "re-analysis started" feedback,
  - an in-progress state visible on the main workbench,
  - success confirmation when refreshed results are loaded,
  - clear failure feedback when the API rejects or fails.
- The root app should mount a toast host if toast notifications are used.
- Analyzer rules should not classify non-certificate review, audit, conclusion, or summary forms as certificate validity evidence merely because a certificate keyword appears elsewhere on the same page.
- Candidate extraction should validate the local validity-field context, not only the whole page context.
- The regression case should cover a page where `# 项目评审结论表` and a real certificate/use-validity block appear near each other, ensuring only the real certificate validity date is retained.
- Keep `.trellis/**` local-only for commits and pushes.

## Proposed API Shape

```http
POST /api/audit/jobs/{id}/reanalyze
```

Successful response:

```ts
type ReanalyzePayload = {
  job: AuditHistoryJob
  result: AuditResult
  distribution: DistributionRow[]
}
```

Expected behavior:

- Auth: require normal authenticated user.
- Ownership: use `db.getJobForUser(id, context.user.id, context.user.role)`.
- Runtime: only `runtime === "paddleocr"` is supported.
- Status: only completed jobs should be re-analyzed in the first version.
- Storage: read `paddleocr.jsonl` from R2/object store.
- Analysis: run `analyzePaddleOcrJsonl({ jobId: id, cutoff: job.cutoff, jsonl })`.
- Artifacts: overwrite `result.json`, `ocr.txt`, and `matches.csv`.
- Persistence: call `db.updateFromResult(id, analyzed.result.summary)`.

## Acceptance Criteria

- [ ] Completed PaddleOCR history rows expose a `重新分析` action.
- [ ] Clicking the action calls the new same-origin API and shows a busy state for that record.
- [ ] Re-analysis displays a visible global/main-workbench progress or toast cue even if the history drawer closes quickly.
- [ ] Re-analysis success displays a confirmation that the current result has been refreshed.
- [ ] Re-analysis failure displays the API/user-facing error through both the existing alert path and a transient feedback path if toast is available.
- [ ] Re-analysis reads existing `paddleocr.jsonl` and does not submit a PaddleOCR job.
- [ ] Re-analysis does not mutate quota ledgers or consume OCR pages/jobs.
- [ ] Refreshed results reflect the current analyzer rules.
- [ ] `# 项目评审结论表` and similar non-certificate review forms are filtered out of `matches`, `near_expiry`, `needs_review`, and `candidates` unless the local candidate context is a real certificate/registration context.
- [ ] Split "使用有效期" ranges on real certificate pages still use the later/end date.
- [ ] The history list and current result panel update after success.
- [ ] Non-completed, missing, unauthorized, or non-PaddleOCR jobs return user-readable errors.
- [ ] Focused tests cover the API/helper behavior where practical.
- [ ] Focused analyzer tests cover the screenshot-derived false-positive shape.

## Definition of Done

- Implementation changes are limited to business code under `web/`.
- `.trellis/**` remains uncommitted.
- Tests, lint, and build pass.
- Code is committed and pushed without Trellis files when the user confirms deployment.
- Cloudflare deployment can proceed after push.

## Out of Scope

- Re-uploading the PDF.
- Re-submitting or re-running PaddleOCR.
- Creating duplicate history jobs.
- Changing quota policy.
- Changing cutoff date during re-analysis.
- Batch re-analysis of multiple history records.
- Background queueing or scheduled migration of historical records.
- Broad document classification beyond certificate-validity extraction.
- Rendering OCR/provider Markdown as HTML.

## Technical Notes

- Likely backend files:
  - `web/src/app/api/audit/jobs/[id]/reanalyze/route.ts`
  - `web/src/lib/audit-analyzer.ts` if artifact helpers are extracted
  - `web/src/lib/__tests__/*` for focused tests
- Likely frontend files:
  - `web/src/components/audit/history-panel.tsx`
  - `web/src/components/audit/audit-command-center.tsx`
  - `web/src/app/layout.tsx`
  - `web/src/components/ui/sonner.tsx`
- Existing helper patterns to reuse:
  - `resultDistribution` from `web/src/lib/audit-python.ts`
  - `createCloudObjectStoreConfig`, `fetchCloudObjectText`, `putCloudObjectText`, `siblingObjectKey`
  - existing history/result loading and error state patterns in `AuditCommandCenter`
- Re-analysis UX findings:
  - `reanalyzeHistoryJob()` currently sets `reanalyzingJobId`, updates the result, refreshes history/user state, then closes the history drawer.
  - `HistoryPanel` has row-local `重新分析中` text, but the main workbench has no re-analysis status and no toast host.
- Analyzer repair findings:
  - `analyzeOcrPages()` gates scanning with `isCertificatePage(pageText)`, then scans every validity marker line on that page.
  - This is too broad for mixed OCR pages and should be supplemented with local candidate-context filtering.
