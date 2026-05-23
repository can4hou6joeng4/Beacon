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

Do not reintroduce local chunk upload for production. Retired local endpoints
return `410`.

## File Validation

Use `validateCloudUploadInput(...)` and route-level checks:

- filename must end with `.pdf`
- content type should be `application/pdf` when available
- file size must be positive
- file size must not exceed the current 100MB app upload limit
- uploaded Blob size must match the created upload session

Quota must be checked before expensive provider work.

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
