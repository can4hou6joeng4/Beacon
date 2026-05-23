# Cloudflare R2 Binding Upload Path

## Question

How should the production PDF upload path work when the Worker is configured with
`AUDIT_OBJECT_STORE_DRIVER=r2-binding`?

## Findings

- The current production contract binds R2 as `AUDIT_BUCKET` in
  `web/wrangler.jsonc`; this is the intended Cloudflare-only path.
- R2 binding mode gives the Worker direct object APIs such as `put` and `get`.
  It does not provide an S3 endpoint, access key, or secret key for browser
  presigned uploads.
- The existing `createPresignedPutUrl` path is correct only for the `r2-s3`
  fallback driver, because it needs endpoint/bucket/access-key/secret
  configuration.
- The observed production failure is reproducible on
  `POST /api/audit/cloud-uploads`: it returns `500 {"error":"Invalid URL
  string."}` before the browser uploads bytes, because the r2-binding config has
  no endpoint for URL construction.

## Recommendation

Implement the MVP repair by keeping `r2-binding` and moving the PDF bytes
through the Worker:

1. `POST /api/audit/cloud-uploads` creates the authenticated job and returns a
   short-lived or same-origin upload target for that job.
2. The browser uploads the PDF to a same-origin API route owned by the Worker.
3. The Worker validates ownership, content type, size, and quota, then writes the
   bytes with `AUDIT_BUCKET.put(objectKey, file, { httpMetadata })`.
4. PaddleOCR submission should not require a downloadable URL in binding mode.
   PaddleOCR's async API supports local-file multipart submission. The Worker
   can read the private R2 object through `AUDIT_BUCKET.get(...)`, append it to
   a `FormData` request as `file`, and send `model` plus JSON-stringified
   `optionalPayload` fields to PaddleOCR.
5. No production path should require R2 S3 access keys.

## Refined Decision

Use two storage-specific submission paths:

- `r2-binding`: Worker-mediated private object read plus PaddleOCR multipart
  file submission. This keeps the PDF private, avoids a new signed download
  token schema, and uses the API shape already validated by the user's
  PaddleOCR sample.
- `r2-s3`: existing presigned GET URL submission remains a fallback for S3
  compatible deployments.

## Risks

- Worker request body limits still apply; the app already caps uploads at 100MB.
- Failed upload-session creation must not consume quota or leave dangling jobs.
- Failed Worker-side object upload must refund reserved upload bytes or mark the
  job as failed so the quota ledger stays auditable.
- Multipart submission sends the PDF from the Worker to PaddleOCR, so the code
  must avoid logging provider credentials, file contents, or generated provider
  payloads.
