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
- OCR becomes a PaddleOCR asynchronous adapter, with the current macOS OCR path retained as a fallback/development profile until cloud OCR parity is validated.

## Requirements

- Keep `pdf-audit.bobochang.cn` as the final user-facing hostname.
- Do not break the current local macOS service while migration work is in progress.
- Add a deployment architecture document that clearly separates:
  - current local mode,
  - recommended cloud mode,
  - fallback/container/macOS-host modes.
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
- Document DNS cutover from Cloudflare Tunnel to cloud origin/Worker route.

## Recommended MVP Scope

This task should first produce a migration-ready architecture and project configuration skeleton without replacing OCR completely in one pass.

MVP deliverables:

- Add cloud migration design documentation.
- Add environment examples for local vs cloud deployment modes.
- Add a PaddleOCR OCR adapter boundary in documentation and/or minimal code if it can be done safely.
- Add a staged execution checklist for the next implementation task.
- Keep all existing local commands and tests working.

## Out of Scope

- Removing the current local Python/Swift OCR path.
- Switching DNS production traffic before cloud parity is verified.
- Implementing full AWS/GCP/Azure account provisioning in this pass.
- Rewriting the OCR algorithm from scratch without a comparison run.
- Committing any real PaddleOCR token or provider credential.

## Acceptance Criteria

- [ ] The repo contains a clear cloud deployment/migration plan.
- [ ] The plan explains why direct serverless deployment of the current OCR backend is not viable.
- [ ] The plan identifies the recommended architecture and at least two fallback options.
- [ ] The plan documents PaddleOCR async job submission, polling, JSONL download, and result normalization.
- [ ] The plan preserves `pdf-audit.bobochang.cn` as the public hostname.
- [ ] The plan includes a step-by-step migration sequence and rollback path.
- [ ] Local tests/build checks that are relevant to documentation/config changes pass, or failures are documented.

## Definition of Done

- Trellis task is active and has persisted PRD/research context.
- Documentation is updated in the repo under `docs/operations/`.
- Any changed config examples are validated for consistency.
- Existing local runtime path remains untouched unless explicitly changed by later work.
