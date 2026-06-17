# Production Leading Use-Validity Evidence

## Source

- D1 job: `2a21e7af-2d64-4b01-a931-6cc25282d57f`
- File: `6.23.pdf`
- Cutoff: `2026-06-23`
- R2 prefix: `jobs/2a21e7af-2d64-4b01-a931-6cc25282d57f/`

## Production Summary

Remote D1 reports:

- `pages_ocr=344`
- `validity_candidates=90`
- `matches=1`
- `near_expiry=1`
- `needs_review=10`

Saved `result.json` contains no `2026-06-22` rows.

## OCR Evidence

Saved `ocr.txt` includes `2026年03月24日 - 2026年06月22日` in four relevant certificate pages:

- Page 43: heading lines before `使用有效期`; current local code recognizes it.
- Page 93: `使用有效期` is the first OCR line, certificate title follows.
- Page 118: `使用有效期` is the first OCR line, certificate title follows.
- Page 135: split `使用有效期` / date continuation first, image markup and certificate title follow.

Representative failing page shape:

```text
使用有效期：2026年03月24日
- 2026年06月22日
<div>...</div>
中华人民共和国
# 一级造价工程师注册证书
姓 名：陈思羽
...
```

## Local Reanalysis Observation

Using current local `web/src/lib/audit-analyzer.ts` against the saved production `paddleocr.jsonl`:

- Summary changes to `matches=2`, `near_expiry=2`, `needs_review=19`.
- Page 43 becomes a `2026-06-22` match.
- Pages 93, 118, and 135 remain absent from candidates and review rows.

## Suspected Root Cause

`localValidityClassificationSegment()` trims after-context at certificate document boundaries. When the validity marker is at page line 0 and the certificate title follows it, the classification segment may exclude the certificate marker needed by `isCertificateValidityContext()`. The candidate is then filtered before date extraction can classify it as a match.

## Verification Target

After the fix, local reanalysis of the saved `paddleocr.jsonl` should include `expiry_date: "2026-06-22"` for pages 43, 93, 118, and 135.
