# Diagnose Upload Failure and Improve Upload Error UX

## Goal

Find the real production reason behind the current PDF upload failure and improve the upload interaction so users see the actionable root cause instead of the secondary "current task state does not allow PDF upload" message.

## What I already know

- The user saw `检查失败 当前任务状态不允许上传 PDF`.
- The message is returned by `web/src/app/api/audit/cloud-uploads/[jobId]/file/route.ts` when the job is already `failed`, `complete`, or has `providerJobId`.
- The normal upload flow is create cloud upload session, PUT the PDF to `/api/audit/cloud-uploads/:jobId/file`, then submit `/api/audit/cloud-uploads/paddleocr`.
- Production uses Cloudflare Worker/OpenNext, R2 binding mode, D1 database `pdf-audit-db`, and object prefix `jobs`.
- The frontend currently uses the same retry helper for upload session creation, PDF upload, and PaddleOCR submission.

## Assumptions

- The visible error may be a second request against a job that was already failed by the first upload attempt.
- The most useful diagnosis is in the recent D1 `jobs` rows and quota ledger rows for the failing job.
- UX should distinguish a stale/already-advanced upload session from a true upload transport/storage failure.

## Requirements

- Query production data to identify why the current upload failed.
- Preserve the account isolation boundary when inspecting and changing job routes.
- Avoid routing large PDFs through the Worker when R2 S3 signing credentials are available.
- Improve the failed upload message so it explains what likely happened and what the user should do next.
- Avoid exposing internal storage keys, tokens, or provider credentials in client-facing errors.
- Keep the existing upload, quota reservation/refund, PaddleOCR submission, polling, result, and history flows intact.

## Acceptance Criteria

- [ ] The root cause of the current failed upload is identified from production state or logs.
- [ ] Browser-to-R2 presigned direct upload is used when R2 S3 signing config is available.
- [ ] Worker upload remains available as a fallback until signing secrets are configured.
- [ ] Upload-state rejection returns a more actionable error payload/message.
- [ ] The frontend displays a clear, user-facing instruction for stale, failed, completed, or already-submitted upload jobs.
- [ ] Tests cover the improved upload-state rejection behavior where practical.
- [ ] Lint and relevant tests pass.

## Definition of Done

- Tests added or updated where appropriate.
- Lint / typecheck / test command pass or any blockers are documented.
- Behavior changes are summarized for the user.
- Trellis finish-work can archive the task after implementation.

## Out of Scope

- Replacing all server-side artifact reads/writes with S3 API calls.
- Changing PaddleOCR provider selection or model settings.
- Broad upload progress redesign beyond the confusing failure interaction.
- Changing quota accounting semantics unless the diagnosis proves it is the root cause.

## Technical Notes

- Relevant route: `web/src/app/api/audit/cloud-uploads/[jobId]/file/route.ts`.
- Relevant frontend flow: `web/src/components/audit/audit-command-center.tsx`.
- Relevant D1 binding: `AUDIT_DB` in `web/wrangler.jsonc`.
- Relevant R2 binding: `AUDIT_BUCKET` in `web/wrangler.jsonc`.
- Direct-upload activation requires `AUDIT_OBJECT_ACCESS_KEY_ID` and `AUDIT_OBJECT_SECRET_ACCESS_KEY` Worker secrets.
