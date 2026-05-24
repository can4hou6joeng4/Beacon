# Storage Guidelines

> Cloudflare R2, uploaded PDFs, OCR artifacts, and object-key safety.

---

## Storage Model

Production storage uses Cloudflare R2 through the `AUDIT_BUCKET` binding.

Reference files:

| Concern | Path |
| --- | --- |
| Object store wrapper | `web/src/lib/cloud-object-store.ts` |
| Upload session route | `web/src/app/api/audit/cloud-uploads/route.ts` |
| Worker upload fallback | `web/src/app/api/audit/cloud-uploads/[jobId]/file/route.ts` |
| PaddleOCR submission route | `web/src/app/api/audit/cloud-uploads/paddleocr/route.ts` |
| Result/download routes | `web/src/app/api/audit/jobs/[id]/**/route.ts` |
| Wrangler bindings | `web/wrangler.jsonc` |

The current production driver is `r2-binding`. The older S3 presigned helper
still exists for compatibility/tests, but production should use the Worker R2
binding.

## Object Key Contract

Object keys must stay under the configured prefix, currently `jobs`.

Current upload key shape:

```text
jobs/{jobId}/input.pdf
```

Related artifacts should be sibling keys produced through `siblingObjectKey(...)`.

Rules:

- Generate upload keys with `generateAuditObjectKey(...)`.
- Validate every key before reads/writes with `assertSafeObjectKey(...)`.
- Reject keys containing `..`, leading `/`, backslashes, or the wrong prefix.
- Do not accept arbitrary user-provided object keys without matching them to the
  authenticated job row.

## Upload Flow

1. Authenticated user calls `POST /api/audit/cloud-uploads`.
2. Route validates filename, size, content type, cutoff, quota, and R2 config.
3. Route creates a D1 job row and reserves upload quota.
4. Browser uploads the PDF through the returned upload target.
5. Browser calls `POST /api/audit/cloud-uploads/paddleocr`.
6. Server fetches the R2 object as a Blob and submits it to PaddleOCR file mode.
7. Server stores provider job ID/status in D1.

For `r2-binding` production uploads, the Worker upload route should pass
`request.body` to `putCloudObjectStream(...)` instead of calling
`request.blob()`. This keeps large PDFs out of Worker heap during the upload
phase. Validate `Content-Length` against the D1 upload session when present; if
the header is absent, still require `request.body` and rely on the pre-created
quota/session limit plus R2 write failure handling.

Do not reintroduce local chunk upload for production. Retired local endpoints
return `410`.

## File Validation

Use `validateCloudUploadInput(...)` and route-level checks:

- filename must end with `.pdf`
- content type should be `application/pdf` when available
- file size must be positive
- file size must not exceed the current 100MB app upload limit
- uploaded `Content-Length`, when provided, must match the created upload
  session
- upload routes must reject missing request bodies before R2 writes

Quota must be checked before expensive provider work.

## Upload Hot Path Contract

### 1. Scope / Trigger

- Trigger: changing `POST /api/audit/cloud-uploads`, `PUT
  /api/audit/cloud-uploads/[jobId]/file`, or R2 helper write behavior.

### 2. Signatures

- `putCloudObjectStream({ objectKey, stream, contentType, config, bucket? }) ->
  Promise<void>`
- `PUT /api/audit/cloud-uploads/{jobId}/file` accepts an authenticated PDF
  request body and returns `{ job, objectKey, size }`.

### 3. Contracts

- `objectKey` must match the authenticated D1 job row.
- `Content-Type` must be `application/pdf` or `application/octet-stream`.
- `Content-Length`, if present, must be positive, within 100MB, and equal to
  `jobs.upload_bytes`.
- The route emits `Server-Timing` entries for `r2_put` and `d1_status`.

### 4. Validation & Error Matrix

| Condition | Error |
| --- | --- |
| Missing job or wrong owner | `404 任务不存在` |
| Complete/failed/provider-attached job | `409 当前任务状态不允许上传 PDF` |
| Invalid content type | `400 INVALID_UPLOAD_TYPE` |
| Empty body or zero length | `400 EMPTY_UPLOAD` |
| Size exceeds 100MB | `400 UPLOAD_TOO_LARGE` |
| Size mismatch with session | `409 UPLOAD_SIZE_MISMATCH` |

### 5. Good/Base/Bad Cases

- Good: browser sends `Content-Length` and route streams directly into R2.
- Base: browser omits `Content-Length`; route still streams body and reports the
  session size.
- Bad: route calls `request.blob()` for production upload and buffers the full
  PDF in Worker memory.

### 6. Tests Required

- `cloud-object-store.test.ts` covers `putCloudObjectStream(...)` forwarding the
  stream to the R2 bucket.
- Route behavior changes should cover size/type/session mismatch if a route test
  harness is added.

### 7. Wrong vs Correct

#### Wrong

```typescript
const blob = await request.blob()
await putCloudObject({ objectKey, content: blob, contentType, config })
```

#### Correct

```typescript
if (!request.body) throw new AppError("上传请求缺少文件内容", { status: 400 })
await putCloudObjectStream({ objectKey, stream: request.body, contentType, config })
```

## R2 Free-Tier Boundary

The admin quota UI and server validation assume the current Cloudflare free
baseline documented in `web/src/lib/quota-limits.ts`:

- R2 storage: 10GB/month
- R2 Class A operations: 1,000,000/month
- R2 Class B operations: 10,000,000/month

These values are quota policy inputs for this project. If Cloudflare pricing or
the account plan changes, update `quota-limits.ts`, UI copy, tests, and this spec
in the same task.

## Artifact Access

- Return only short-lived upload/download URLs or same-origin redirects.
- Do not persist public R2 URLs in the UI.
- Do not expose R2 access keys, secret keys, bucket internals, or signed URL
  signatures in logs or error payloads.
- Download routes must require auth and job ownership before redirecting.

## Caching

There is no session cache layer in the current app. Session authority is D1 plus
the HttpOnly cookie. Do not add Cloudflare Cache API session caching unless a
task explicitly designs invalidation and security behavior.

## Do Not Use

- Do not use Hono `c.env.R2_BUCKET` examples.
- Do not create `src/lib/r2/` modules unless the existing wrapper is being
  intentionally split.
- Do not store uploaded PDFs on local disk for production.
- Do not bypass `assertSafeObjectKey`.
