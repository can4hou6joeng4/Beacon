# Cloud Platform Options

## Sources checked

- Cloudflare Workers limits: <https://developers.cloudflare.com/workers/platform/limits/>
- Cloudflare Workers Next.js guide: <https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/>
- Cloudflare R2 multipart upload docs: <https://developers.cloudflare.com/r2/objects/multipart-objects/>
- Cloudflare R2 limits: <https://developers.cloudflare.com/r2/platform/limits/>
- Cloudflare Containers limits: <https://developers.cloudflare.com/containers/platform-details/limits/>
- AWS Textract async text detection: <https://docs.aws.amazon.com/textract/latest/dg/API_StartDocumentTextDetection.html>
- AWS Textract async workflow: <https://docs.aws.amazon.com/textract/latest/dg/api-async.html>
- Google Cloud Vision PDF/TIFF OCR: <https://docs.cloud.google.com/vision/docs/pdf>
- Azure AI Content Understanding limits: <https://learn.microsoft.com/en-us/azure/ai-services/content-understanding/service-limits>
- User-provided PaddleOCR async job API sample for `PaddleOCR-VL-1.5`.

## Relevant platform constraints

Cloudflare Workers:

- Supports deploying Next.js via the OpenNext adapter.
- Has 128 MB memory per Worker isolate.
- Request body limit depends on the Cloudflare account plan: 100 MB on Free/Pro, 200 MB on Business, 500 MB default on Enterprise.
- Large request/response bodies should be streamed instead of buffered.

Cloudflare R2:

- Single uploads are suitable for small/medium files; multipart upload is recommended for large/resumable uploads.
- R2 object size limit is 5 TiB.
- Multipart upload supports up to 10,000 parts.

Cloudflare Containers:

- Can run container workloads behind Workers.
- Predefined instance types range from very small `lite` to `standard-4` with 4 vCPU, 12 GiB memory, and 20 GB disk.
- This can host Linux OCR code, but not macOS `PDFKit`/`Vision`.

AWS Textract:

- Supports asynchronous text detection for PDFs stored in S3.
- `StartDocumentTextDetection` returns a `JobId`, with completion delivered through SNS/SQS or polled through the result API.
- Asynchronous PDF size limit is 500 MB.

Google Cloud Vision:

- Supports asynchronous PDF/TIFF OCR from Cloud Storage.
- Accepts PDF/TIFF files up to 2,000 pages.
- Writes output JSON files to Cloud Storage.

Azure AI Content Understanding:

- Supports OCR/layout extraction for PDFs.
- Basic/Standard document extraction limit shown in current docs is 200 MB and 300 pages.

PaddleOCR async API:

- Supports job submission at `https://paddleocr.aistudio-app.com/api/v2/ocr/jobs`.
- Supports local multipart file upload and URL-based submission through `fileUrl`.
- Uses bearer token authentication.
- Model target supplied by the user: `PaddleOCR-VL-1.5`.
- Job states observed in the sample: `pending`, `running`, `done`, `failed`.
- Running progress can expose `extractProgress.totalPages` and `extractProgress.extractedPages`.
- Completed jobs expose `resultUrl.jsonUrl`, whose content is JSONL.
- JSONL records contain `result.layoutParsingResults[].markdown.text`, markdown images, and output images.
- Provider token must be configured as a secret, not committed to the repository.

## Feasible approaches

### Option A: Cloudflare front door + PaddleOCR async provider

Architecture:

- `pdf-audit.bobochang.cn` -> Cloudflare Worker/OpenNext app.
- R2 stores uploaded PDFs and output artifacts.
- D1/Turso/Postgres stores job metadata/history.
- Worker or queue creates OCR jobs with PaddleOCR using the `PaddleOCR-VL-1.5` model.
- A webhook/poller updates status and normalizes OCR output into the existing result shape.

Pros:

- Fully detached from the local Mac.
- Best operational reliability for external users.
- Keeps Cloudflare as DNS/front-door.
- Removes macOS uptime/network dependency.
- Uses a concrete async OCR API already supplied by the user.
- PaddleOCR markdown output may preserve document structure better than plain OCR text.

Cons:

- Requires replacing or adapting OCR output parsing.
- External OCR cost and data-governance review are required.
- Bookmark/person extraction may need a separate PDF parsing step because provider OCR output alone may not preserve the existing bookmark logic.
- Need to validate PaddleOCR service limits, retention behavior, and SLA before production cutover.

Recommended when the primary goal is true cloud operation.

PaddleOCR implementation notes:

- Prefer URL mode: upload the PDF to object storage, generate a short-lived signed URL, then submit `fileUrl` to PaddleOCR.
- Use multipart local file mode only from trusted server-side code if URL mode is unavailable.
- Poll `GET /api/v2/ocr/jobs/{jobId}` every 5 seconds initially.
- Map `pending -> queued`, `running -> running`, `done -> complete`, `failed -> failed`.
- On `done`, fetch `resultUrl.jsonUrl`, parse JSONL, and persist a normalized `ocr.txt`/intermediate artifact.
- Keep markdown images/output images optional in the first cloud MVP unless the UI needs visual evidence downloads.

### Option B: Cloudflare front door + Linux OCR container

Architecture:

- `pdf-audit.bobochang.cn` -> Cloudflare Worker/OpenNext app.
- R2 + D1/Turso/Postgres for storage/history.
- Cloudflare Containers, Fly.io, Render, AWS ECS, or a VPS runs a Linux OCR service using Poppler/PyMuPDF + Tesseract/PaddleOCR/etc.

Pros:

- More control over OCR code and data flow.
- Avoids sending documents to a third-party OCR API if self-hosted.
- Container or VPS can support long-running jobs better than edge functions.

Cons:

- Requires a real port of `swift/pdf_audit.swift`.
- OCR accuracy may differ from macOS Vision.
- More infrastructure ownership than provider OCR.

Recommended when data control matters more than fastest migration.

### Option C: Remote macOS host for current OCR engine

Architecture:

- Next.js/front door can move cloud-side.
- OCR service remains the same Python/Swift service on a rented/owned macOS host.
- Cloudflare routes requests to that host instead of the current local Mac.

Pros:

- Lowest code-change path for OCR correctness.
- Preserves PDFKit/Vision behavior.

Cons:

- Still depends on a machine, just not this local one.
- macOS cloud hosting is more expensive and operationally odd.
- Does not simplify the system as much as a provider/container architecture.

Recommended only as a short bridge if OCR parity is more important than cloud-native operation.

### Option D: AWS/GCP/Azure document OCR provider

Architecture:

- Same front door, object storage, and cloud DB as Option A.
- OCR jobs go to AWS Textract, Google Vision, or Azure Document Intelligence instead of PaddleOCR.

Pros:

- Mature cloud-provider integrations.
- Stronger account, IAM, and operations tooling.

Cons:

- No longer the first choice because a concrete PaddleOCR async API is now available.
- Result shape differs and may require more normalization work.

Recommended as a fallback if PaddleOCR output quality, limits, retention policy, or availability is not acceptable.

## Recommendation

Use Option A with PaddleOCR as the main migration target:

1. Move public UI/API/storage/history to Cloudflare-centered cloud infrastructure.
2. Use R2 for PDFs/artifacts.
3. Use D1 or Turso/Postgres for job history.
4. Replace the OCR execution path with a PaddleOCR-backed async OCR adapter using `PaddleOCR-VL-1.5`.
5. Keep the local macOS backend as a fallback profile until cloud OCR parity is verified against `投标文件.pdf`.

Option B should remain the fallback if PaddleOCR output is not good enough for Chinese certificate pages or data-policy requirements reject provider OCR. Option D remains the fallback if PaddleOCR itself is operationally unsuitable but a managed OCR provider is still acceptable.
