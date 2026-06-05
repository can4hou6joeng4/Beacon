# Upgrade PaddleOCR-VL-1.6 model

## Goal

Evaluate and implement the PaddleOCR official `PaddleOCR-VL-1.6` model update for the cloud OCR path, keeping the existing Cloudflare Worker + R2 + D1 architecture and preserving the current audit artifact contract.

## What I Already Know

- Production OCR currently uses PaddleOCR asynchronously through `https://paddleocr.aistudio-app.com/api/v2/ocr`.
- The current configured model is `PaddleOCR-VL-1.5` in `web/wrangler.jsonc`, `web/env.cloud.example`, tests, README, and deployment docs.
- The active adapter already supports both official URL mode and multipart file mode:
  - URL mode posts JSON with `fileUrl`, `model`, and `optionalPayload`.
  - File mode posts `file`, `model`, and JSON-stringified `optionalPayload`.
- The official PaddleOCR 1.6 sample keeps the same job endpoint and polling endpoint shape:
  - `POST /api/v2/ocr/jobs`
  - `GET /api/v2/ocr/jobs/{jobId}`
  - `data.state` values include `pending`, `running`, `done`, and `failed`.
  - `data.resultUrl.jsonUrl` still points to JSONL output.
- The sample uses optional payload defaults already represented by this project:
  - `useDocOrientationClassify: false`
  - `useDocUnwarping: false`
  - `useChartRecognition: false`
- The user-provided example included a bearer token. Do not store that token in source, docs, Trellis files, logs, screenshots, or `NEXT_PUBLIC_*` variables.

## Requirements

- Switch the default PaddleOCR model from `PaddleOCR-VL-1.5` to `PaddleOCR-VL-1.6` wherever production configuration and documented defaults define the active model.
- Keep `PADDLEOCR_MODEL` as an environment/config override so rollback to 1.5 is a configuration change.
- Preserve the current optional payload behavior unless 1.6 validation proves a change is necessary.
- Confirm that the 1.6 JSONL output still normalizes through `parsePaddleOcrJsonlMarkdown(...)` and downstream `analyzePaddleOcrJsonl(...)` without losing pages.
- Keep URL mode as the production-preferred path for R2 presigned GET URLs and file mode as the Worker fallback path.
- Update tests and docs that assert or describe the default model.
- Do not expose or commit PaddleOCR API tokens.
- If deploying in this task, use the existing Cloudflare workflow from `web/` and verify production health after deployment.

## Acceptance Criteria

- [x] `createPaddleOcrConfig()` defaults to `PaddleOCR-VL-1.6` when `PADDLEOCR_MODEL` is not set.
- [x] `web/wrangler.jsonc` production variable uses `PaddleOCR-VL-1.6`.
- [x] `web/env.cloud.example`, README, and cloud deployment docs describe `PaddleOCR-VL-1.6`.
- [x] PaddleOCR request-builder tests assert model `PaddleOCR-VL-1.6` for URL and file modes.
- [x] Existing PaddleOCR status parsing still supports `pending`, `running`, `done`, and `failed`.
- [x] Existing JSONL markdown parsing tests still pass, or a focused fixture is added if 1.6 output differs.
- [x] Relevant checks pass from `web/`: `npm run test`, `npm run lint`, `npm run build`, and `npm run cf:build`.
- [x] If deployed, `env -u CLOUDFLARE_API_TOKEN npm run cf:deploy` succeeds and `https://pdf-audit.bobochang.cn/` returns `200`.

## Definition Of Done

- Model default/config/docs/tests are updated consistently.
- Cloudflare-specific environment and secret handling remains aligned with `.trellis/spec/backend/environment.md`.
- No secrets or signed URLs are written to repository files or terminal summaries.
- A rollback path is documented: set `PADDLEOCR_MODEL=PaddleOCR-VL-1.5` and redeploy or roll back the Worker version.
- Any live OCR smoke test result is summarized with job IDs and high-level status only, not raw OCR payloads.

## Out Of Scope

- Reintroducing the retired local Python/macOS OCR service.
- Replacing PaddleOCR with another OCR provider.
- Changing quota semantics, upload limits, auth, R2 object key layout, or D1 schema.
- Committing real PaddleOCR bearer tokens or adding public direct-provider endpoints.
- Downloading or storing PaddleOCR output images unless a separate feature requires image artifacts.

## Technical Notes

- Likely implementation files:
  - `web/src/lib/paddleocr.ts`
  - `web/src/lib/__tests__/paddleocr.test.ts`
  - `web/wrangler.jsonc`
  - `web/env.cloud.example`
  - `README.md`
  - `docs/operations/cloud-deployment-migration.md`
- Current runtime config bridge:
  - `web/src/lib/paddleocr-runtime.ts` reads Cloudflare runtime env through OpenNext context.
- Current cloud submission route:
  - `web/src/app/api/audit/cloud-uploads/paddleocr/route.ts`
- Relevant specs:
  - `.trellis/spec/backend/environment.md`
  - `.trellis/spec/backend/security.md`
  - `.trellis/spec/backend/storage.md`
  - `.trellis/spec/backend/quality.md`
  - `.trellis/spec/shared/typescript.md`
- Cloudflare deploy command on this machine:
  - `cd web && env -u CLOUDFLARE_API_TOKEN npm run cf:deploy`

## Completion Notes

- Deployed Worker version: `d8c978da-3d91-4677-80c4-86e58d3b06b4`.
- Wrangler deployment output confirmed `env.PADDLEOCR_MODEL ("PaddleOCR-VL-1.6")`.
- Existing Cloudflare `PADDLEOCR_API_TOKEN` secret was not changed.
- Production smoke checks:
  - `curl -I https://pdf-audit.bobochang.cn/` returned `200`.
  - Unauthenticated `GET /api/auth/me` returned `401 UNAUTHENTICATED`.
