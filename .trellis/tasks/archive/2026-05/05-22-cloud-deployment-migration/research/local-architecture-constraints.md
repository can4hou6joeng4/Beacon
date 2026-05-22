# Local Architecture Constraints

## Current shape

The project is currently a local macOS service exposed through Cloudflare Tunnel.

- `README.md` explicitly describes the tool as a macOS local web tool.
- `src/pdf_expiry_checker/server.py` is a Python stdlib HTTP server that stores jobs under local `jobs/<job_id>/`.
- `src/pdf_expiry_checker/runner.py` shells out to `swift/pdf_audit.swift`.
- `swift/pdf_audit.swift` imports `PDFKit`, `Vision`, and `AppKit`, then falls back to a local `tesseract` executable when Vision fails or `PDF_AUDIT_SKIP_VISION=1`.
- `web/` is a Next.js command center that proxies job creation/status/result calls to the Python server using `PYTHON_AUDIT_BASE_URL`.
- `web/src/lib/audit-db.ts` stores history in local SQLite via `better-sqlite3`.
- `web/src/lib/upload-store.ts` stores chunked uploads under a local filesystem directory.
- `deploy/local/*` uses macOS LaunchAgents and `cloudflared` to keep Python, Next.js, and the named Tunnel running.

## What can move easily

- The browser UI and most React components can be deployed remotely after replacing Node-local assumptions.
- The history API can move from `better-sqlite3` to D1, Turso, Postgres, or another cloud database.
- Upload staging can move from local filesystem chunks to object storage such as R2 or S3.
- The public hostname `pdf-audit.bobochang.cn` can keep pointing to Cloudflare. The DNS target changes from a Tunnel route to a Worker/Pages/custom-origin route.

## What cannot move as-is

The OCR worker cannot run unchanged on normal Linux serverless platforms because the core script depends on macOS frameworks:

- `PDFKit`
- `Vision`
- `AppKit`

It also assumes a local executable environment for `swift` and possibly `tesseract`.

Therefore, a cloud migration must pick one of these directions:

1. Keep the existing macOS OCR code and run it on a persistent macOS host.
2. Replace the OCR backend with a cloud OCR provider.
3. Port the OCR backend to Linux/container-compatible libraries and run it in a container or VM.

## Direct deployment blockers

- Pure Cloudflare Workers cannot run the Swift/macOS helper.
- Vercel/Netlify serverless functions cannot run macOS frameworks and are not a good fit for long OCR jobs or local SQLite/filesystem state.
- A single remote Node process can run the Next.js app, but it still needs a durable OCR backend, object storage, and persistent history.
- The current `completeUpload()` path rebuilds a whole `Blob` from chunks in memory, which should be replaced before deploying to memory-limited runtimes.

## Compatibility contract to preserve

The migration should keep the existing product behavior:

- upload a PDF,
- specify a cutoff date,
- show progress and history,
- return `result.json`, `matches.csv`, `ocr.txt`, and `manifest.json`,
- keep "conclusion first, drill-down evidence" result presentation,
- keep `pdf-audit.bobochang.cn` as the user-facing hostname.
