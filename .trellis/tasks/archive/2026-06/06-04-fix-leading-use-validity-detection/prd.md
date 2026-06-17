# Fix Leading Use-Validity Detection

## Goal

Fix certificate expiry analysis so a certificate page is still classified as a certificate validity context when the OCR output places `使用有效期` at the very beginning of the page and the certificate title appears shortly after it.

## What I Already Know

- The production job `2a21e7af-2d64-4b01-a931-6cc25282d57f` processed `6.23.pdf` with cutoff `2026-06-23`.
- Production D1 currently records `validity_candidates=90`, `matches=1`, `near_expiry=1`, and `needs_review=10`.
- The saved production `result.json` has no `2026-06-22` rows.
- The saved production `ocr.txt` does contain `2026年03月24日 - 2026年06月22日` on pages 43, 93, 118, and 135.
- Re-running the saved production `paddleocr.jsonl` with current local code produces `matches=2`, including page 43, but still misses pages 93, 118, and 135.
- The failing shape is:
  - line 0: `使用有效期...`
  - following lines: optional continuation date or image markup
  - later lines: `中华人民共和国 一级造价工程师注册证书` or equivalent title
- Current code likely filters these rows in `isCertificateValidityContext` because `localValidityClassificationSegment` trims at a document boundary before the certificate marker can be observed.

## Requirements

- Recognize `使用有效期` rows as certificate validity candidates when the certificate marker appears after the field near the top of the same OCR page.
- Treat expiry dates on the cutoff date as matched/expired, not near-expiry.
- Preserve existing filtering that avoids non-certificate review forms and unrelated validity rows.
- Preserve range-end extraction so `2026年03月24日 - 2026年06月22日` resolves to `2026-06-22`.
- Update focused analyzer tests for:
  - marker first, certificate heading after marker;
  - split marker/date line first, certificate heading after marker;
  - image markup between the split date and certificate heading;
  - non-certificate review form still ignored.
- Verify the saved production `paddleocr.jsonl` produces matches for pages 43, 93, 118, and 135 after the fix.
- If checks pass, deploy the Worker and re-run the existing history reanalysis path for the production job.

## Acceptance Criteria

- [ ] Unit tests cover leading `使用有效期` before certificate title.
- [ ] Unit tests cover expiry date equality with the cutoff date.
- [ ] `npm run test -- src/lib/__tests__/audit-analyzer.test.ts` passes from `web/`.
- [ ] Full relevant checks pass or any skipped checks are explicitly justified.
- [ ] Re-running `/tmp/pdf-audit-paddleocr-2a21e7af.jsonl` locally with cutoff `2026-06-23` yields `2026-06-22` matches for pages 43, 93, 118, and 135.
- [ ] Production deployment is updated after code verification.
- [ ] Existing job `2a21e7af-2d64-4b01-a931-6cc25282d57f` is reanalyzed so saved `result.json` reflects the fixed rules.

## Definition of Done

- Tests added or updated for the parser behavior.
- Lint/type/build checks run according to project guidelines.
- Cloudflare deployment verified when production behavior changes.
- Trellis spec update considered.
- Changes committed with a focused message.

## Out of Scope

- Re-running PaddleOCR for the PDF.
- Changing the OCR provider, model, or upload flow.
- Reintroducing local Python/macOS OCR services.
- Building a new bookmark-to-result mapping system in this task.
- Changing frontend result table behavior beyond what is necessary to display corrected backend results.

## Technical Notes

- Primary code: `web/src/lib/audit-analyzer.ts`.
- Primary tests: `web/src/lib/__tests__/audit-analyzer.test.ts`.
- Reanalysis API exists at `web/src/app/api/audit/jobs/[id]/reanalyze/route.ts`.
- Production artifacts were downloaded to `/tmp/pdf-audit-result-2a21e7af.json`, `/tmp/pdf-audit-ocr-2a21e7af.txt`, and `/tmp/pdf-audit-paddleocr-2a21e7af.jsonl` for diagnosis only; these must not be committed.
