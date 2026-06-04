# Retire local OCR runtime

## Goal

Retire the runnable local Python/macOS OCR runtime now that the production
service runs on Cloudflare Workers, R2, D1, and PaddleOCR. The repository should
make the cloud path the only supported business runtime, while preserving useful
compatibility signals and regression coverage.

## What I already know

* The production hostname is `https://pdf-audit.bobochang.cn`.
* `web/wrangler.jsonc` configures the Cloudflare Worker custom domain, D1, R2,
  and PaddleOCR runtime variables.
* `.trellis/spec/backend/api-module.md` and
  `.trellis/spec/backend/environment.md` state that root-level Python/Swift
  files are historical/local references, not the production business runtime.
* Current Next.js API routes already return `410` for retired local upload/OCR
  endpoints.
* `web/src/lib/audit-analyzer.ts` contains the current TypeScript audit result
  analysis path for PaddleOCR JSONL.
* `src/pdf_expiry_checker/`, `swift/pdf_audit.swift`, `static/`, `run_local.py`,
  and `deploy/local/` still provide a runnable local Mac/Python service.
* Root README still presents launchd, Python OCR, local static UI, Tunnel, and
  macOS requirements as normal startup paths, which conflicts with the cloud-only
  production direction.
* Root Python tests cover legacy parser/server/runner behavior; some parser
  examples remain valuable as regression cases for the TypeScript analyzer.

## Assumptions

* Production no longer needs a local Mac OCR fallback or rollback path.
* Old local API clients should receive explicit `410` responses rather than
  silent route removal during this cleanup.
* Historical planning docs under `docs/superpowers/` can remain as archived
  design history if they are clearly not presented as current operating
  instructions.
* The deletion should be scoped to repo-maintained runtime paths, not to user
  machine state outside the repository such as installed LaunchAgents.

## Requirements

* Remove runnable local OCR service code from the repository:
  * `run_local.py`
  * `src/pdf_expiry_checker/`
  * `swift/pdf_audit.swift`
  * `static/`
* Remove or retire repository-owned local service deployment scripts that exist
  only to run the Mac/Python/Tunnel setup:
  * `deploy/local/start-python.sh`
  * `deploy/local/com.a1.pdf-expiry.python.plist`
  * local service orchestration that assumes Python OCR and Cloudflare Tunnel are
    production infrastructure
* Keep Next.js API compatibility routes that return `410` for retired local
  endpoints unless implementation evidence shows they are unused and safe to
  remove.
* Remove production defaults that create new jobs with `runtime="local-python"`;
  new cloud jobs should default to `paddleocr`.
* Preserve or migrate useful regression coverage from Python tests into the
  TypeScript test suite, especially date extraction, review classification, and
  OCR failure/status behavior that still applies to PaddleOCR output.
* Update root README and current operations docs so the supported path is
  Cloudflare Worker/R2/D1/PaddleOCR only.
* Ensure docs do not instruct operators to start Python OCR, local static UI,
  launchd Mac services, or Cloudflare Tunnel as the current production path.
* Do not remove authentication, quota, R2/D1, PaddleOCR, history, result
  download, or admin functionality from `web/`.

## Acceptance Criteria

* [ ] No README or current operations document presents the local Python/macOS
      OCR service as a supported runtime.
* [ ] The repository no longer contains runnable root-level Python/Swift/static
      local OCR service entry points.
* [ ] New audit jobs default to `paddleocr` in TypeScript DB drivers and schema
      setup paths.
* [ ] Existing retired local API routes still return clear `410` responses, or
      their removal is explicitly justified in the implementation notes.
* [ ] Valuable Python OCR parser regression cases are represented in
      `web/src/lib/__tests__/` where they still apply to the cloud analyzer.
* [ ] Legacy root Python tests are removed or replaced so the remaining test
      suite reflects the cloud-only runtime.
* [ ] `cd web && npm run test` passes.
* [ ] `cd web && npm run lint` passes.
* [ ] `cd web && npm run build` passes.
* [ ] `cd web && npm run cf:build` passes, or any failure is documented with a
      concrete blocker.

## Definition of Done

* Implementation follows `.trellis/spec/backend`, `.trellis/spec/shared`, and
  relevant `big-question` guidance.
* Changes are minimal and do not introduce new dependencies.
* Git diff shows one focused cleanup theme: retiring local OCR runtime.
* Tests and build checks are run as far as the environment allows.
* Any durable rule discovered during cleanup is captured in `.trellis/spec/`
  before finish.

## Out of Scope

* Replacing PaddleOCR with another OCR provider.
* Redesigning the audit workbench UI.
* Changing production Cloudflare account secrets, D1 data, R2 buckets, DNS, or
  live Worker deployment unless a verification step requires it.
* Deleting user-machine LaunchAgents or files outside this repository.
* Rewriting archived historical planning documents unless they are linked as
  current operating instructions.

## Technical Notes

* Relevant specs:
  * `.trellis/spec/backend/index.md`
  * `.trellis/spec/backend/api-module.md`
  * `.trellis/spec/backend/api-patterns.md`
  * `.trellis/spec/backend/environment.md`
  * `.trellis/spec/backend/storage.md`
  * `.trellis/spec/backend/security.md`
  * `.trellis/spec/backend/quality.md`
  * `.trellis/spec/shared/index.md`
  * `.trellis/spec/shared/code-quality.md`
  * `.trellis/spec/guides/index.md`
* Initial reference scan used:
  * `rg "run_local|pdf_expiry_checker|pdf_audit\\.swift|start-python|local-python|PYTHON_AUDIT|Python OCR|macOS|PDFKit|Vision|static/|本机 OCR|本机|旧版静态|launchd|Cloudflare Tunnel|cloudflared|8787|start-next|start-cloudflared"`
* Known legacy runtime paths:
  * `src/pdf_expiry_checker/server.py`
  * `src/pdf_expiry_checker/runner.py`
  * `src/pdf_expiry_checker/extractor.py`
  * `swift/pdf_audit.swift`
  * `run_local.py`
  * `static/index.html`
  * `static/styles.css`
  * `static/app.js`
  * `deploy/local/*`
* Web compatibility paths currently returning `410` include:
  * `web/src/app/api/audit/jobs/route.ts`
  * `web/src/app/api/audit/uploads/**/route.ts`
  * `web/src/app/api/audit/jobs/[id]/{status,result,download/[file]}/route.ts`
  * `web/src/app/api/audit/paddleocr/jobs/**/route.ts`
