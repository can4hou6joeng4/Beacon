# Fix Remaining Certificate Review Noise

## Goal

Reduce remaining false-positive review rows after the PaddleOCR header-block fix for `06.24.pdf`, while preserving conservative review behavior for genuine registered cost engineer certificate pages where the document `使用有效期` is not present in OCR output.

## What I Already Know

- The production job `21e18b98-060b-4f06-88ef-6fcdc9395108` processed `06.24.pdf` with cutoff `2026-06-24`.
- After the previous fix, the refreshed production result is:
  - `pages_ocr=265`
  - `matches=3`
  - `near_expiry=16`
  - `needs_review=9`
- The confirmed matches are:
  - page 2: `2026-06-23`
  - page 90: `2026-06-22`
  - page 141: `2026-06-22`
- The remaining review pages are `1, 10, 18, 26, 34, 50, 104, 111, 126`.
- Page 1 is a resume table. It mentions `一级注册造价师证` as a table value, but it is not itself a certificate page. This is review noise.
- Pages `10, 18, 26, 34, 50, 104, 111, 126` visually render as older cost engineer certificate documents. Their OCR raw blocks do not include `使用有效期`, so they should remain conservative `needs_review` rows.

## Requirements

- Do not classify resume/personnel tables as registered cost engineer certificate document pages only because a table cell says `注册执业证书名称` or contains `一级注册造价师证`.
- Preserve existing candidate extraction for certificate pages and identity/business license validity rows.
- Preserve `needs_review` behavior for real registered cost engineer certificate pages that lack a document `使用有效期`.
- Add focused regression tests for:
  - resume/personnel table with certificate-name row should not produce `needs_review`;
  - old-style registered cost engineer certificate page without `使用有效期` should still produce `needs_review`;
  - existing header-block `使用有效期` match behavior remains intact.
- Re-run analysis against the saved `06.24.pdf` PaddleOCR JSONL and confirm `needs_review` drops by removing page 1 while matches stay at 3.

## Acceptance Criteria

- [ ] Unit tests cover resume table review noise and old-style certificate review preservation.
- [ ] Replaying `/tmp/pdf-audit-21e-paddleocr.jsonl` with cutoff `2026-06-24` yields `matches=3`.
- [ ] Replay no longer includes page 1 in `needs_review`.
- [ ] Replay still includes pages `10, 18, 26, 34, 50, 104, 111, 126` in `needs_review`.
- [ ] `npm run test`, `npm run lint`, `npm run build`, and `npm run cf:build` pass from `web/`.
- [ ] If deployed, production Worker is updated and the existing history artifacts/D1 summary for `06.24.pdf` are refreshed.

## Definition Of Done

- Tests are added or updated for the behavior.
- Implementation is minimal and scoped to audit classification.
- Trellis spec update is considered if a durable rule is learned.
- Changes are committed with a focused Chinese commit message.

## Out Of Scope

- Re-running PaddleOCR for the PDF.
- Changing the OCR provider, model, upload flow, or UI table design.
- Automatically interpreting old-style extension registration tables as document `使用有效期`.
- Removing all manual review rows. The system should remain conservative when the document use-validity field is absent.

## Technical Notes

- Main code: `web/src/lib/audit-analyzer.ts`
- Main tests: `web/src/lib/__tests__/audit-analyzer.test.ts`
- Current saved artifacts:
  - `/tmp/pdf-audit-21e-paddleocr.jsonl`
  - `/tmp/pdf-audit-21e-current-result.json`
  - `/tmp/pdf-audit-21e-ocr-fixed.txt`
- Relevant spec files:
  - `.trellis/spec/backend/api-module.md`
  - `.trellis/spec/backend/type-safety.md`
  - `.trellis/spec/backend/quality.md`
  - `.trellis/spec/shared/code-quality.md`
  - `.trellis/spec/shared/typescript.md`
