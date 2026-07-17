# HTTP API Contract — PDF Certificate Expiry Audit (`pdf-audit.bobochang.cn`)

Source of truth: `web/src/app/api/**/route.ts`, `web/src/lib/{audit-types,auth-types,auth,quota,quota-limits,quota-period,audit-analyzer,audit-progress,audit-reanalysis,cloud-object-store,cloud-upload-errors,paddleocr,audit-isolation,app-error,api-response}.ts`, client callers in `web/src/components/`.

## 0. Global conventions

- **Base**: same-origin, all paths under `/api/`. All requests/responses are JSON unless noted (raw PDF PUT, artifact downloads).
- **Auth transport**: httpOnly cookie `pdf_audit_session` (random token; server stores SHA-256 hash). No Authorization header anywhere except bootstrap. Client must send cookies (`credentials` default `same-origin` is what the current app relies on) and use `cache: "no-store"` on GETs.
- **Success envelope**: none. Success bodies are plain domain JSON (no `{data: ...}` wrapper).
- **Error envelope** (`jsonError` in `api-response.ts`):
  - Expected failure (`AppError`): HTTP = `error.status`, body `{ "error": "<中文 message>", "code": "<CODE>" }`.
  - Unexpected `Error`: HTTP 500, body `{ "error": "<error.message>" }` — **no `code` field**.
  - Non-Error throw: HTTP 500, body `{ "error": "<route fallback 中文>" }`.
  - Important consequence: several validation failures throw plain `Error`, so they surface as **500** with a Chinese message and no code (flagged per-endpoint below).
- **Timestamps**: ISO-8601 strings (`new Date().toISOString()`); `cutoff` is a bare `YYYY-MM-DD` string.
- **Auth guards**: `requireAuth` → 401 `{"error":"请先登录后再使用审计功能","code":"UNAUTHENTICATED"}`; `requireAdmin` → additionally 403 `{"error":"只有管理员可以执行该操作","code":"ADMIN_REQUIRED"}`. Disabled users and expired sessions behave as unauthenticated (session lookup requires `users.status='active'` and unexpired session). Every authenticated request touches `sessions.last_seen_at`.
- **Job ownership**: `getJobForUser`/`requireAuditJobForUser` — role `admin` sees every job; role `user` sees only own jobs; a foreign/missing job is always **404** (`AUDIT_JOB_NOT_FOUND`, message `任务不存在` unless overridden), never 403.

### Shared types (exact field names)

```ts
type AuditStatusValue = "queued" | "running" | "complete" | "failed" | "unknown"

type AuditHistoryJob = {
  id: string                      // UUID
  userId: string | null
  pythonJobId: string | null      // always null for new jobs (legacy)
  providerJobId: string | null    // PaddleOCR job id once submitted
  objectKey: string | null        // "jobs/{jobId}/input.pdf"
  runtime: "local-python" | "paddleocr"  // new jobs always "paddleocr"
  filename: string
  cutoff: string                  // "YYYY-MM-DD"
  status: AuditStatusValue
  message: string                 // Chinese human-readable status line
  createdAt: string               // ISO-8601
  updatedAt: string
  completedAt: string | null
  pagesOcr: number
  ocrErrorPages: number
  ocrTotalPages: number
  certificatePages: number
  validityCandidates: number
  matches: number
  nearExpiry: number
  needsReview: number
  uploadBytes: number             // reserved upload size in bytes
  ocrPagesUsed: number            // pages billed against quota
}

type AuditSummary = {
  pages_ocr: number
  ocr_error_pages?: number
  ocr_total_pages?: number
  validity_candidates: number
  matches: number
  near_expiry: number
  needs_review: number
  cutoff: string                  // "YYYY-MM-DD"
}

type AuditRowItem = { person_index?: number; person?: string; bookmark?: string; start_page?: number; end_page?: number }

type AuditRow = {
  page: number                    // 1-based PDF page
  title: string                   // first non-empty OCR line of the page
  context: string                 // multi-line OCR evidence window (lines joined with "\n")
  field_context: string           // trimmed validity-field segment used for date extraction
  expiry_date?: string | null     // "YYYY-MM-DD" | "长期" | null
  reason?: string                 // only on needs_review rows (中文)
  items?: AuditRowItem[]          // always [] from the PaddleOCR analyzer
}

type AuditResult = {
  job_id: string
  summary: AuditSummary
  manifest?: { page_count: number; outline_count: number; certificate_items: number; certificate_pages: number } // NOT produced by the PaddleOCR analyzer — absent
  ocr_errors?: Array<{ page: number; error: string }>
  matches: AuditRow[]             // expiry ≤ cutoff (inclusive)
  near_expiry: AuditRow[]         // cutoff < expiry ≤ cutoff+45 days
  needs_review: AuditRow[]        // validity marker found but date unparsable
  candidates: AuditRow[]          // ALL parsable validity rows (superset containing matches/near_expiry members and valid ones)
}

type StageState = { activeStep: number; failed: boolean; complete: boolean; label: string }
// queued→{1,false,false}, running→{3,false,false}, complete→{5,false,true}, failed→{3,true,false}, unknown→{1,false,false}; label = message || status

type PaddleOcrProviderProgress = {
  provider: "paddleocr"
  state: "pending" | "running" | "done" | "failed"
  totalPages: number | null
  extractedPages: number | null
  percent: number | null          // round(extracted/total*100) clamped 0–100; 100 when done; null when unknown
  startedAt: string | null
  endedAt: string | null
  message: string                 // same Chinese message as job.message
}

type DistributionRow = { name: string; value: number; kind: "danger" | "warning" | "review" | "ok" }
// always exactly 4 rows in this order:
// {name:"截止日内到期", kind:"danger", value:summary.matches}
// {name:"临近到期",   kind:"warning", value:summary.near_expiry}
// {name:"需要复核",   kind:"review",  value:summary.needs_review}
// {name:"有效",       kind:"ok",      value:max(validity_candidates - (matches+near_expiry+needs_review), 0)}

type UserRole = "admin" | "user"
type UserStatus = "active" | "disabled"

type AppUser = {
  id: string; username: string; email: string; name: string
  role: UserRole; status: UserStatus
  createdAt: string; updatedAt: string; lastLoginAt: string | null
}

type UserQuotaSnapshot = {
  quota: { userId: string; uploadBytesLimit: number; ocrJobsLimit: number; ocrPagesLimit: number; period: "lifetime"; updatedAt: string }
  usage: { uploadBytes: number; ocrJobs: number; ocrPages: number }      // current UTC day only
  remaining: { uploadBytes: number; ocrJobs: number; ocrPages: number }  // max(0, limit - usage)
}

type PublicUser = AppUser & { quota: UserQuotaSnapshot }
```

---

## 1. Endpoint table

### 1.1 Auth

| # | Method + Path | Guard | Request | Success response | Errors | Side effects |
|---|---|---|---|---|---|---|
| A1 | `POST /api/auth/bootstrap` | none (token-gated) | Token via `Authorization: Bearer <AUTH_BOOTSTRAP_TOKEN>` header **or** body `token`. Body: `{username? \| account? \| email?, email?, name? (default "Admin"), password, token?, quota?: {uploadBytesLimit?, ocrJobsLimit?, ocrPagesLimit?}}`. Username used = `username \|\| account \|\| email`. Quota defaults: 10 GiB / 25 jobs / 2000 pages. | **201** `{ user: PublicUser }` | 503 `BOOTSTRAP_TOKEN_MISSING` 未配置 AUTH_BOOTSTRAP_TOKEN; 401 `BOOTSTRAP_UNAUTHORIZED` 初始化令牌无效; 409 `BOOTSTRAP_CLOSED` 管理员账号已经初始化 (any user exists); plus all user-validation errors (see A5) | Creates first admin user + `user_quotas` row |
| A2 | `POST /api/auth/login` | none | `{username? \| account? \| email?, password}` — login key = `username \|\| account \|\| email`, matched against username **or** email (lowercased) | **200** `{ user: PublicUser }` + `Set-Cookie: pdf_audit_session=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800; Secure` (Secure when HTTPS or production) | 401 `INVALID_CREDENTIALS` 账号或密码不正确 (wrong password, unknown user, or disabled user — indistinguishable by design) | Creates session row (7-day TTL, stores token hash + user-agent), sets `lastLoginAt` |
| A3 | `POST /api/auth/logout` | none (best-effort) | empty body | **200** `{ ok: true }` + clears cookie (`Max-Age=0`) | — (always succeeds; 500 fallback 退出登录失败) | Deletes session row for cookie token if present |
| A4 | `GET /api/auth/me` | requireAuth | — | **200** `{ user: PublicUser }` (includes fresh `quota` snapshot — this **is** the quota-status endpoint) | 401 `UNAUTHENTICATED` | touches session `last_seen_at` |

### 1.2 Admin users (no DELETE endpoint exists — deactivate via `PATCH status:"disabled"`)

| # | Method + Path | Guard | Request | Success response | Errors | Side effects |
|---|---|---|---|---|---|---|
| A5 | `GET /api/admin/users` | requireAdmin | — | **200** `{ users: PublicUser[] }` (each with live quota snapshot) | 401 / 403 | — |
| A6 | `POST /api/admin/users` | requireAdmin | `{username? \| email?, email?, name, password, role? (default "user"), quota?: {uploadBytesLimit?, ocrJobsLimit?, ocrPagesLimit?}}` — quota fields individually default to 10 GiB / 25 / 2000 | **201** `{ user: PublicUser }` | 400 `INVALID_USERNAME` (must match `/^[a-z0-9][a-z0-9_-]{2,31}$/` after lowercasing; message 账号需为 3-32 位字母、数字、下划线或连字符，并以字母或数字开头); 400 `INVALID_EMAIL` 请输入有效邮箱; 400 `INVALID_NAME` 请输入用户名称; 400 `INVALID_ROLE` 用户角色无效; 400 `WEAK_PASSWORD` 密码至少需要 10 位; 400 `INVALID_QUOTA` X必须是非负整数 (0 allowed); 400 `UPLOAD_QUOTA_LIMIT_EXCEEDED` 上传额度不能超过 Cloudflare R2 免费层 10GB; 400 `OCR_PAGE_LIMIT_EXCEEDED` OCR 页数额度不能超过 PaddleOCR 每日 2000 页上限; 409 `USER_EXISTS` 该账号已经存在 | Creates user + quota row (PBKDF2 100k) |
| A7 | `PATCH /api/admin/users/[id]` | requireAdmin | `{name?, role?, status? ("active"\|"disabled"), quota?: {uploadBytesLimit?, ocrJobsLimit?, ocrPagesLimit?}}` — **caveat**: when `quota` object is present, omitted quota fields become `0` (route substitutes `?? 0`); always send all three | **200** `{ user: PublicUser }` | 404 `USER_NOT_FOUND` 用户不存在; same quota validation errors as A6 | Updates user row; quota update appends `adjust` ledger entry (amount 0, audit trail only) |

### 1.3 Audit pipeline (live)

| # | Method + Path | Guard | Request | Success response | Errors | Side effects |
|---|---|---|---|---|---|---|
| B1 | `GET /api/audit/history` | requireAuth | — | **200** `{ jobs: AuditHistoryJob[] }` — newest-first (`created_at DESC, id DESC`), max **20**; admins get all users' jobs, users only their own | 401 | — |
| B2 | `POST /api/audit/cloud-uploads` | requireAuth | `{filename: string, size: number, contentType?: string (default "application/pdf"), cutoff?: "YYYY-MM-DD"}`. Validation: filename present & lowercase-ends-with `.pdf`; `1 ≤ size ≤ 104857600` (100 MiB); cutoff matches `/^\d{4}-\d{2}-\d{2}$/` else error, defaults to today (UTC date) | **200** `{ jobId: string, objectKey: string, uploadUrl: string, uploadExpiresAt: string, method: "PUT", headers: { "Content-Type": string }, uploadMode: "worker" \| "r2-presigned" }` — see §2 | 401; 402 `QUOTA_EXHAUSTED` 当前账号额度不足，请联系管理员调整额度 (upload_bytes); **500 (no code)** for payload validation: 缺少上传文件信息 / 请上传 PDF 文件 / PDF 文件超过当前 100MB 上传限制 / 无效的截止日期 (plain `Error`s, not `AppError`); 500 fallback 创建云端上传会话失败 | D1: `createJob` row `{status:"queued", message:"等待上传", objectKey:"jobs/{jobId}/input.pdf", runtime:"paddleocr", uploadBytes:size, counters 0}`. Quota: availability check + `reserve` ledger entry for `upload_bytes` = size |
| B3 | `PUT /api/audit/cloud-uploads/[jobId]/file` | requireAuth + ownership | **Raw PDF bytes as body** (streamed). Headers: `Content-Type` must normalize to `application/pdf` or `application/octet-stream`; `Content-Length` (if present): ≥1, ≤100 MiB, and **must equal the job's reserved `uploadBytes`** | **200** `{ job: AuditHistoryJob, objectKey: string, size: number }` — job now `{status:"queued", message:"PDF 已上传，等待提交 PaddleOCR"}` | 401; 404 `AUDIT_JOB_NOT_FOUND` 任务不存在; 409 `UNSUPPORTED_UPLOAD_MODE` 当前对象存储模式不支持 Worker 上传 (driver ≠ r2-binding); 400 (no code) `{"error":"任务不支持云端 PDF 上传"}` (non-paddleocr/no objectKey); 409 `UPLOAD_SESSION_FAILED` / `UPLOAD_SESSION_COMPLETED` / `UPLOAD_ALREADY_SUBMITTED` / `UPLOAD_SESSION_STALE` (see §2); 400 `INVALID_UPLOAD_TYPE` 请上传 PDF 文件; 400 `EMPTY_UPLOAD` 上传文件为空 / 上传请求缺少文件内容; 400 `UPLOAD_TOO_LARGE`; 409 `UPLOAD_SIZE_MISMATCH` 上传文件大小与会话记录不一致，请重新创建上传任务; 500 fallback 上传 PDF 到 R2 失败 | R2: streams body to `AUDIT_BUCKET` at `objectKey` (stored content-type forced `application/pdf`). D1: status update. **On post-guard failure**: refunds `upload_bytes` once + flips job to `{status:"failed", message:"PDF 上传到 R2 失败，已回退上传额度"}` |
| B4 | `POST /api/audit/cloud-uploads/paddleocr` | requireAuth + ownership | `{jobId: string, objectKey: string}` — objectKey must exactly equal the job's stored key | **200** `{ job: AuditHistoryJob, objectKey: string, providerJobId: string }` — job now `{status:"queued", message:"PaddleOCR 任务已创建"}`. **Idempotent**: if already submitted, returns 200 `{job, objectKey, providerJobId}` immediately, no double quota charge | 401; 400 (no code) `{"error":"缺少任务 ID"}` / `{"error":"缺少对象存储路径"}`; 404 `AUDIT_JOB_NOT_FOUND` 任务不存在或对象路径不匹配; 404 `AUDIT_JOB_OBJECT_MISMATCH` 任务不存在或对象路径不匹配; 402 `QUOTA_EXHAUSTED` (ocr_jobs); 502 `PADDLEOCR_UNAUTHORIZED` PaddleOCR 鉴权失败：PADDLEOCR_API_TOKEN 无效、过期或未授权当前接口; 500 (no code) provider submit errors; 500 fallback 提交云端 OCR 任务失败 | Quota: `consume` 1 `ocr_jobs` (idempotent per job, billed to job **owner**). Submits PDF to PaddleOCR (URL mode via presigned GET when S3 creds set, else downloads blob from R2 and posts multipart). D1: stores `providerJobId`. On failure: refunds ocr_jobs once + marks job `failed` with the error message |
| B5 | `GET /api/audit/jobs/[id]/status` | requireAuth + ownership | — (poll every 1.5 s) | **200** see §3 | 401; 404 (no code) `{"error":"任务不存在"}` (missing/foreign job) or `{"error":"PaddleOCR 任务不存在"}` (no providerJobId yet — i.e. polling before B4); 402 `QUOTA_EXHAUSTED` (ocr_pages, on the completion transition); 502 `PADDLEOCR_UNAUTHORIZED`; **410** (no code) `{"error":"本机 OCR 状态查询已停用，请使用云端 PaddleOCR 任务"}` for legacy `local-python` jobs; 500 fallback 读取任务状态失败 | **This GET is the pipeline engine**: syncs provider state → D1 `updateFromStatus` on every poll; on first poll where provider is `done` (and `result.json` not yet in R2): downloads OCR JSONL, runs analyzer, consumes `ocr_pages` quota (delta-idempotent, billed to owner), writes 4 R2 artifacts (`paddleocr.jsonl`, `ocr.txt`, `matches.csv`, `result.json`), updates D1 summary + `ocrPagesUsed`, sets `completedAt` |
| B6 | `GET /api/audit/jobs/[id]/result` | requireAuth + ownership | — | **200** `{ job: AuditHistoryJob, result: AuditResult, distribution: DistributionRow[4] }` — served from stored `result.json`, never recomputed | 401; 404 (no code) `{"error":"任务不存在"}` / `{"error":"云端任务缺少对象路径"}`; **500** (no code) `{"error":"Object artifact not found"}` when `result.json` doesn't exist yet (job not complete); 410 for legacy runtime; 500 fallback 读取结果失败 | D1: re-syncs summary counters from artifact (`updateFromResult`) |
| B7 | `GET /api/audit/jobs/[id]/download/[file]` | requireAuth + ownership | `file` ∈ `{"matches.csv","result.json","ocr.txt","manifest.json"}` | **200** raw file body with `Content-Type` (json→`application/json; charset=utf-8`, csv→`text/csv; charset=utf-8`, else `text/plain; charset=utf-8`) and `Content-Disposition: attachment; filename="<file>"` (r2-binding driver, production). With S3 driver instead: **307 redirect** to a presigned GET URL | 401; 400 (no code) `{"error":"不支持的下载文件"}`; 404 `{"error":"任务不存在"}` / `{"error":"云端任务缺少对象路径"}`; **500** `{"error":"Object artifact not found"}` if artifact missing — note `manifest.json` is whitelisted but never written for paddleocr jobs, so it always 500s; 410 legacy; 500 fallback 下载失败 | none |
| B8 | `POST /api/audit/jobs/[id]/reanalyze` | requireAuth + ownership | empty body | **200** `{ job: AuditHistoryJob, result: AuditResult, distribution: DistributionRow[4] }` (same shape as B6) — re-runs analyzer from stored `paddleocr.jsonl` with the job's **original cutoff** | 401; 404 `AUDIT_JOB_NOT_FOUND`; 409 `REANALYZE_UNSUPPORTED_RUNTIME` 仅支持重新分析云端 PaddleOCR 历史任务; 409 `REANALYZE_JOB_NOT_COMPLETE` 仅支持重新分析已完成的历史任务; 404 `REANALYZE_OBJECT_KEY_MISSING` 云端任务缺少对象路径; 404 `PADDLEOCR_JSONL_ARTIFACT_MISSING` 历史记录缺少 PaddleOCR 原始结果，无法重新分析; 500 fallback 重新分析历史记录失败 | Rewrites `ocr.txt`, `matches.csv`, `result.json` in R2; D1 summary updated. **No quota charge** |

### 1.4 Intentional tombstones (all return 410 after passing `requireAuth`, so unauthenticated = 401)

| Method + Path | 410 body `error` |
|---|---|
| `POST /api/audit/jobs` | 本机 OCR 任务入口已停用，请使用 /api/audit/cloud-uploads |
| `POST /api/audit/uploads` | 本机分片上传已停用，请使用 /api/audit/cloud-uploads |
| `PUT /api/audit/uploads/[id]/chunk` | 本机分片上传已停用，请使用对象存储上传地址 |
| `POST /api/audit/uploads/[id]/complete` | 本机分片上传已停用，请使用 /api/audit/cloud-uploads/paddleocr |
| `POST /api/audit/paddleocr/jobs` | 请通过对象存储上传流程提交 OCR，直连 fileUrl 已关闭以保证任务归属和额度审计 |
| `GET /api/audit/paddleocr/jobs/[jobId]/status` | 请通过任务状态接口查询 OCR 状态，直连 provider job 查询已关闭以保证任务归属审计 |

A rebuilt frontend must **not** call these. (410 bodies have no `code` field.)

---

## 2. Upload dual-mode contract

`POST /api/audit/cloud-uploads` response tells the client exactly how to perform the PUT; the client must treat it as opaque instructions:

```json
{
  "jobId": "6f0e…",
  "objectKey": "jobs/6f0e…/input.pdf",
  "uploadUrl": "…",
  "uploadExpiresAt": "2026-07-17T09:15:00.000Z",
  "method": "PUT",
  "headers": { "Content-Type": "application/pdf" },
  "uploadMode": "worker" | "r2-presigned"
}
```

- **Mode selection (server-side, silent)**: `"r2-presigned"` iff all four S3 secrets (`AUDIT_OBJECT_STORE_ENDPOINT`, `AUDIT_OBJECT_BUCKET`, `AUDIT_OBJECT_ACCESS_KEY_ID`, `AUDIT_OBJECT_SECRET_ACCESS_KEY`) are configured; otherwise `"worker"`. **Production default is `worker`.**
- **`worker` mode**: `uploadUrl` is the relative path `/api/audit/cloud-uploads/{jobId}/file`. Client PUTs the raw `File` there; the session cookie authenticates it. `uploadExpiresAt` = now + `AUDIT_OBJECT_UPLOAD_EXPIRES_SECONDS` (default 900 s) but is informational only in this mode (not enforced). Response body is JSON `{job, objectKey, size}`; error bodies are the standard JSON envelope.
- **`r2-presigned` mode**: `uploadUrl` is an absolute SigV4 presigned R2 URL (signature expires at `uploadExpiresAt`, default 15 min). Cross-origin PUT — requires R2 CORS; error responses come from R2 (often non-JSON; the current UI shows a generic CORS/signing hint when `uploadMode === "r2-presigned"` and the body isn't parseable JSON).
- **Client behavior (both modes, identical code path)**: `fetch(session.uploadUrl, { method: session.method, headers: session.headers, body: file })` — send exactly the returned `headers` (only `Content-Type`), body = the raw PDF bytes. Do not add other headers.
- **Worker-route hard rules** (all `AppError` 4xx JSON):
  - `Content-Type` (parameters stripped, lowercased) must be `application/pdf` or `application/octet-stream`, else 400 `INVALID_UPLOAD_TYPE`.
  - `Content-Length`, when parseable, must be ≥1 (400 `EMPTY_UPLOAD`), ≤ 104857600 (400 `UPLOAD_TOO_LARGE`), and **exactly equal** the `size` declared at session creation (409 `UPLOAD_SIZE_MISMATCH` — client must create a new session if the file changed).
  - **Re-upload-after-submit rule (409 family)**: once a job has left the pre-submit state, PUT is rejected —
    - job status `failed` → 409 `UPLOAD_SESSION_FAILED` "这次上传会话已经失败，系统已回退上传额度。请重新选择 PDF 发起新的检查。"
    - job status `complete` → 409 `UPLOAD_SESSION_COMPLETED` "这个检查任务已经完成，不能继续上传 PDF。请发起新的检查任务。"
    - `providerJobId` already set (submitted to PaddleOCR) → 409 `UPLOAD_ALREADY_SUBMITTED` "PDF 已经提交给 PaddleOCR 解析，不能重复上传。请在任务进度中查看结果。"
    - any other unusable state → 409 `UPLOAD_SESSION_STALE`.
  - Retrying the PUT while the job is still `queued` without a providerJobId is allowed (overwrites the object).
- Recovery from any 409/failed upload = start over at `POST /api/audit/cloud-uploads` (new jobId; quota reserve happens again; failed sessions auto-refund their reserve).

---

## 3. Status polling contract — `GET /api/audit/jobs/[id]/status`

Success body (paddleocr jobs):

```json
{
  "job": { …AuditHistoryJob… },
  "status": { "status": "queued|running|complete|failed", "message": "中文进度描述" },
  "stage": { "activeStep": 1|3|5, "failed": false, "complete": false, "label": "…" },
  "providerProgress": {
    "provider": "paddleocr",
    "state": "pending|running|done|failed",
    "totalPages": 12,          // number | null
    "extractedPages": 5,       // number | null
    "percent": 42,             // number | null (round(extracted/total*100) clamped; 100 when done; null when unknown)
    "startedAt": "…|null",
    "endedAt": "…|null",
    "message": "PaddleOCR 正在解析：5/12 页"
  }
}
```

- `job` is the **freshly-synced** D1 row (typed nullable in code but non-null in practice since the job was just loaded). `status.status` mirrors `job.status`.
- **Status enum over the lifecycle** (`AuditStatusValue`): 
  - `"queued"` — after session creation (`message:"等待上传"`), after PUT (`"PDF 已上传，等待提交 PaddleOCR"`), after submit (`"PaddleOCR 任务已创建"`), and while provider state is `pending` (`"PaddleOCR 任务已创建，等待处理"`). There is **no distinct "uploaded" status value** — upload progress is conveyed via `message`.
  - `"running"` — provider `running`; `message` `"PaddleOCR 正在解析：{extracted}/{total} 页"` or `"PaddleOCR 正在解析"` when counts unknown.
  - `"complete"` — provider `done`; `message:"PaddleOCR 解析完成"`; `job.completedAt` set; summary counters populated. **Terminal.**
  - `"failed"` — provider `failed` (message = provider `errorMessage` or `"PaddleOCR 解析失败"`), or set server-side by upload/submit failure handlers. **Terminal** (client stops polling; server would keep re-syncing if polled).
  - `"unknown"` exists in the type but is never produced by the paddleocr path.
- **What flips server-side on each poll**: provider snapshot fetched → `jobs.status/message/updated_at` written every poll. On the completion poll (provider `done` + `jsonUrl`, and only if `result.json` is not already in R2 — makes concurrent polls safe): JSONL fetched → analyzer run with the job's original `cutoff` → `ocr_pages` quota consumed (delta-idempotent: charges `max(0, pages − alreadyConsumed)` against `ocr_total_pages ?? pages_ocr`, billed to the **job owner**, 402 `QUOTA_EXHAUSTED` possible right here) → 4 artifacts written → summary + `ocrPagesUsed` persisted. If nobody polls, nothing happens.
- Polling before OCR submission (no `providerJobId`) yields **404** `{"error":"PaddleOCR 任务不存在"}` — only start polling after B4 succeeds.
- Current client cadence: re-poll via `setTimeout(…, 1500)` until `job.status` is `"complete"` (then fetch result) or `"failed"` (then surface `job.message`).

---

## 4. Result artifact shape

`GET /api/audit/jobs/[id]/result` and `POST /api/audit/jobs/[id]/reanalyze` both return:

```json
{
  "job": { …AuditHistoryJob… },
  "result": {
    "job_id": "6f0e…",
    "summary": {
      "pages_ocr": 34,
      "ocr_error_pages": 0,
      "ocr_total_pages": 34,
      "validity_candidates": 12,
      "matches": 2,
      "near_expiry": 1,
      "needs_review": 3,
      "cutoff": "2026-08-01"
    },
    "ocr_errors": [ { "page": 7, "error": "…" } ],
    "matches":      [ AuditRow… ],
    "near_expiry":  [ AuditRow… ],
    "needs_review": [ AuditRow… ],
    "candidates":   [ AuditRow… ]
  },
  "distribution": [
    { "name": "截止日内到期", "value": 2, "kind": "danger" },
    { "name": "临近到期",     "value": 1, "kind": "warning" },
    { "name": "需要复核",     "value": 3, "kind": "review" },
    { "name": "有效",         "value": 6, "kind": "ok" }
  ]
}
```

Per-entry `AuditRow` fields: `page` (1-based), `title` (first non-empty OCR line of the page), `context` (evidence window: up to 4 lines before + 6 after the validity marker, `\n`-joined; for the whole-page "missing 使用有效期" review rows it's the full page text), `field_context` (the trimmed validity segment the date was parsed from; fixed string `"注册造价师证页未识别到使用有效期"` for that review case), `expiry_date` (`"YYYY-MM-DD"`, `"长期"` — never expires, or `null`), `reason` (needs_review only, e.g. `"有效期字段存在但日期无法可靠解析"`), `items` (always `[]`). Classification: `matches` = expiry ≤ cutoff (inclusive); `near_expiry` = cutoff < expiry ≤ cutoff + **45 days (hardcoded)**; `needs_review` = marker present, date unparsable; `candidates` = all rows with a parsed expiry (includes matches/near_expiry rows and "有效" ones — "有效" is derived as `validity_candidates − matches − near_expiry − needs_review`, never stored). `summary.validity_candidates` = `candidates.length + needs_review.length`. No `manifest` field and no `generatedAt` field exist. `"长期"` rows appear in `candidates` but are never matched/near.

R2 artifacts per job under `jobs/{jobId}/` and their download availability via B7:

| File | Content-Type served | Content |
|---|---|---|
| `result.json` | `application/json; charset=utf-8` | the `AuditResult` above, pretty-printed (2-space) |
| `ocr.txt` | `text/plain; charset=utf-8` | normalized OCR text: blocks `PAGE\t{n}\tLINES\t{count}\tSOURCE\tpaddleocr` … lines … `PAGE_END\t{n}` |
| `matches.csv` | `text/csv; charset=utf-8` | header `page,title,expiry_date,context`; **matches rows only**; all cells double-quoted with `""` escaping |
| `paddleocr.jsonl` | stored `application/x-ndjson; charset=utf-8` | raw provider JSONL — **not downloadable** (not in the whitelist); reanalysis input |
| `manifest.json` | — | whitelisted in B7 but never written for paddleocr jobs → requesting it 500s |
| `input.pdf` | — | uploaded source; not downloadable via any endpoint |

---

## 5. Auth + users + quota specifics

- **`GET /api/auth/me`** → `{ user: PublicUser }`: all `AppUser` fields (`id`, `username`, `email` (empty string if unset), `name`, `role: "admin"|"user"`, `status`, `createdAt`, `updatedAt`, `lastLoginAt: string|null`) plus `quota: UserQuotaSnapshot`. Unauthenticated **must** return 401 JSON (production smoke test).
- **Login**: request `{username, password}` (aliases `account`/`email` accepted). Response `{user: PublicUser}`; session token only in the `Set-Cookie` (7-day `Max-Age`), never in the body. Client reaction today: full `window.location.reload()`.
- **Logout**: `POST`, returns `{ok:true}` and expires the cookie; safe to call unauthenticated.
- **Users admin**: list `{users: PublicUser[]}`; create/patch return `{user: PublicUser}` (201/200). Quota limit **units**: `uploadBytesLimit` in **bytes** (UI edits in MB × 1048576; hard cap 10 GiB = 10737418240), `ocrJobsLimit` in jobs/day (default 25, no cap), `ocrPagesLimit` in pages/day (default & hard cap 2000). Limits are non-negative integers (0 valid). No delete — set `status:"disabled"` (kills future logins and invalidates existing sessions at lookup time).
- **Quota model (read via `user.quota` only — no standalone quota endpoint)**: append-only `quota_ledger` (`reserve`/`consume` count +, `refund` −, `adjust` 0). `usage` sums ledger rows with `created_at` inside the **current UTC calendar day** — quotas effectively reset at 00:00 UTC daily **by design**, even though `quota.period` is the literal string `"lifetime"`. `remaining = max(0, limit − usage)`. Meters: `upload_bytes` reserved at session creation (refunded once on failed upload); `ocr_jobs` consumed 1 per submitted job (idempotent per job; refunded on submit failure); `ocr_pages` consumed on analysis completion (delta-idempotent; billed to job owner, not the poller). Insufficient quota anywhere → **402** `QUOTA_EXHAUSTED` 当前账号额度不足，请联系管理员调整额度.

---

## 6. Client-call map (current UI)

Initial page load is an RSC (`web/src/app/page.tsx`): reads the cookie server-side and passes `initialHistory` (same query as B1) + `currentUser` (PublicUser) as props — no fetch. Auth-state transitions use `window.location.reload()`.

| Component | Endpoint | When / cadence |
|---|---|---|
| `auth/sign-in-panel.tsx` | `POST /api/auth/login` | submit; on 200 → `location.reload()` |
| `audit/audit-command-center.tsx` | `POST /api/audit/cloud-uploads` | form submit, step 1 — via `fetchWithRetries` (5 attempts, retries only network errors & HTTP ≥500, backoff `min(800×attempt, 3200)` ms) |
| 〃 | `PUT {session.uploadUrl}` (worker route or presigned URL) | step 2 — plain `fetch`, **no retry**; headers = `session.headers`, body = `File` |
| 〃 | `POST /api/audit/cloud-uploads/paddleocr` | step 3 — `fetchWithRetries`, body `{jobId, objectKey}` (safe to retry: idempotent) |
| 〃 | `GET /api/audit/jobs/{id}/status` | step 4 — self-rescheduling `setTimeout` loop every **1500 ms**; stops on `complete` (→ result fetch) or `failed`; also on any non-OK response |
| 〃 | `GET /api/audit/jobs/{id}/result` | after status `complete`, and when opening a completed history job |
| 〃 | `POST /api/audit/jobs/{id}/reanalyze` | history drawer "重新分析" button |
| 〃 | `GET /api/audit/history` | after session create, after submit, after result load, after failure — refresh list |
| 〃 | `GET /api/auth/me` | alongside every history refresh — refreshes quota meters |
| 〃 | `POST /api/auth/logout` | sign-out button → `location.reload()` |
| `audit/admin-user-panel.tsx` | `GET /api/admin/users` | mount + after every mutation |
| 〃 | `POST /api/admin/users` | create form |
| 〃 | `PATCH /api/admin/users/{id}` | save / enable / disable per row |

All client GET/POSTs use `cache: "no-store"` and parse bodies defensively with `.json().catch(() => ({ error: "…" }))` into payload types carrying optional `error`/`code`. **Note**: no component currently links to `GET /api/audit/jobs/{id}/download/{file}` — the download endpoints are live and cookie-authenticated (usable as plain `<a href>`), just unwired in today's UI.