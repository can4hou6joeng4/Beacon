# Cloud Deployment Migration

## Goal

Move the PDF certificate expiry checker from a local Mac + Cloudflare Tunnel setup to a cloud-deployed service that no longer depends on this machine staying online, while continuing to serve users through the existing subdomain `pdf-audit.bobochang.cn`.

## What I Already Know

- The current public access path is `pdf-audit.bobochang.cn` through a named Cloudflare Tunnel.
- The current OCR backend is Python + Swift and depends on macOS `PDFKit`, `Vision`, and `AppKit`.
- The current Next.js command center lives under `web/` and proxies to the Python backend with `PYTHON_AUDIT_BASE_URL`.
- The current Next.js layer uses local SQLite via `better-sqlite3` and local filesystem upload staging.
- Existing UX expectations include progress tracking, history browsing, conclusion-first summaries, evidence drill-down, and downloadable artifacts.
- The local OCR flow has a known regression PDF, `投标文件.pdf`, with nested outline behavior covered by tests.
- The preferred cloud OCR candidate is now PaddleOCR's asynchronous job API using model `PaddleOCR-VL-1.5`.
- PaddleOCR credentials must be stored as secrets/environment variables; the real token must not be committed to repository files.

## Research References

- [`research/local-architecture-constraints.md`](research/local-architecture-constraints.md) — maps the current local dependencies and migration blockers.
- [`research/cloud-platform-options.md`](research/cloud-platform-options.md) — compares Cloudflare, object storage, containers, and provider OCR options.

## Feasibility Conclusion

Full cloud deployment is feasible, but not by lifting the current Swift OCR helper unchanged into a normal serverless runtime.

The recommended target is:

- Cloudflare remains the public DNS/front-door layer.
- Uploaded PDFs and generated artifacts move to object storage.
- Job history moves to a cloud database.
- OCR becomes a PaddleOCR asynchronous adapter. The current macOS OCR path is no longer a production fallback; it may remain in the repository only as a legacy development/test reference.

## Requirements

- Keep `pdf-audit.bobochang.cn` as the final user-facing hostname.
- Treat Cloudflare as the only business runtime. Do not restore or depend on the old local macOS service, LaunchAgents, or Cloudflare Tunnel for production access.
- Add a deployment architecture document that clearly separates:
  - historical local mode,
  - active Cloudflare cloud mode,
  - non-local fallback/container/provider OCR modes.
- Define an explicit cloud job lifecycle:
  - create job,
  - upload PDF,
  - store source PDF,
  - enqueue/start OCR,
  - poll or receive completion,
  - download PaddleOCR JSONL output when the job reaches `done`,
  - normalize `layoutParsingResults[].markdown.text` into the existing page-text/result pipeline,
  - normalize OCR output,
  - persist result artifacts,
  - expose status/result/download endpoints.
- Define what must change in `web/` before cloud deployment:
  - replace local upload staging with object storage,
  - replace local SQLite with cloud DB,
  - avoid buffering large PDFs in memory,
  - make backend/OCR provider selection environment-driven.
- Define a validation plan against `投标文件.pdf` and existing tests.
- Document DNS cutover from Cloudflare Tunnel to the Cloudflare Worker custom domain route.

## Recommended MVP Scope

This task should complete the cloud deployment path and leave local service startup out of the business runtime.

MVP deliverables:

- Deploy the OpenNext app to Cloudflare Workers.
- Bind `pdf-audit.bobochang.cn` directly to the Worker custom domain.
- Configure Cloudflare D1, R2, runtime variables, and secrets for production cloud mode.
- Use PaddleOCR as the cloud OCR provider boundary.
- Remove the stale production dependency on local LaunchAgents and Cloudflare Tunnel.

## Out of Scope

- Rewriting or deleting the current local Python/Swift OCR source files.
- Restoring local DNS/Tunnel production traffic after the Worker custom domain is active.
- Implementing full AWS/GCP/Azure account provisioning in this pass.
- Rewriting the OCR algorithm from scratch without a comparison run.
- Committing any real PaddleOCR token or provider credential.

## Acceptance Criteria

- [ ] The repo contains a clear cloud deployment/migration plan.
- [ ] The plan explains why direct serverless deployment of the current OCR backend is not viable.
- [ ] The plan identifies the recommended architecture and at least two fallback options.
- [ ] The plan documents PaddleOCR async job submission, polling, JSONL download, and result normalization.
- [ ] The plan preserves `pdf-audit.bobochang.cn` as the public hostname.
- [ ] The plan includes a step-by-step migration sequence and a cloud-native rollback path.
- [ ] The deployed Cloudflare Worker serves `pdf-audit.bobochang.cn`.
- [ ] The old local Tunnel/DNS route is not required for production access.
- [ ] Local tests/build checks that are relevant to documentation/config changes pass, or failures are documented.

## Definition of Done

- Trellis task is active and has persisted PRD/research context.
- Documentation is updated in the repo under `docs/operations/`.
- Any changed config examples are validated for consistency.
- Production config in `web/wrangler.jsonc` points at the real Cloudflare D1/R2 resources.
- Local runtime may remain as legacy source code, but it is not a production deployment target.
