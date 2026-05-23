import { AppError } from "./app-error"
import { getAuthDb } from "./auth-db"
import type { AuthContext, QuotaResource } from "./auth-types"

export async function reserveUploadQuota(input: {
  context: AuthContext
  jobId: string
  bytes: number
}): Promise<void> {
  assertPositiveAmount(input.bytes, "上传文件大小")
  await ensureQuotaAvailable(input.context, "upload_bytes", input.bytes)
  const db = await getAuthDb()
  await db.addQuotaLedger({
    userId: input.context.user.id,
    jobId: input.jobId,
    resource: "upload_bytes",
    action: "reserve",
    amount: input.bytes,
    reason: "cloud_upload_reserved",
  })
}

export async function consumeOcrJobQuota(input: {
  context: AuthContext
  jobId: string
  userId?: string
}): Promise<void> {
  const userId = input.userId ?? input.context.user.id
  const db = await getAuthDb()
  const existing = await db.getJobLedgerAmount({
    userId,
    jobId: input.jobId,
    resource: "ocr_jobs",
    action: "consume",
  })
  const refunded = await db.getJobLedgerAmount({
    userId,
    jobId: input.jobId,
    resource: "ocr_jobs",
    action: "refund",
  })
  if (existing > refunded) return
  await ensureUserQuotaAvailable(userId, "ocr_jobs", 1)
  await db.addQuotaLedger({
    userId,
    jobId: input.jobId,
    resource: "ocr_jobs",
    action: "consume",
    amount: 1,
    reason: "paddleocr_job_submitted",
  })
}

export async function consumeOcrPageQuota(input: {
  context: AuthContext
  jobId: string
  pages: number
  userId?: string
}): Promise<number> {
  if (!Number.isInteger(input.pages) || input.pages < 0) {
    throw new AppError("OCR 页数无效", { status: 400, code: "INVALID_OCR_PAGES" })
  }
  if (input.pages === 0) return 0
  const userId = input.userId ?? input.context.user.id
  const db = await getAuthDb()
  const consumed = await db.getJobLedgerAmount({
    userId,
    jobId: input.jobId,
    resource: "ocr_pages",
    action: "consume",
  })
  const delta = Math.max(0, input.pages - consumed)
  if (delta === 0) return consumed
  await ensureUserQuotaAvailable(userId, "ocr_pages", delta)
  await db.addQuotaLedger({
    userId,
    jobId: input.jobId,
    resource: "ocr_pages",
    action: "consume",
    amount: delta,
    reason: "paddleocr_pages_analyzed",
  })
  return consumed + delta
}

export async function refundQuota(input: {
  userId: string
  jobId: string
  resource: QuotaResource
  amount: number
  reason: string
}): Promise<void> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) return
  const db = await getAuthDb()
  await db.addQuotaLedger({
    userId: input.userId,
    jobId: input.jobId,
    resource: input.resource,
    action: "refund",
    amount: input.amount,
    reason: input.reason,
  })
}

export async function refundQuotaOnce(input: {
  userId: string
  jobId: string
  resource: QuotaResource
  amount?: number
  reason: string
}): Promise<number> {
  const db = await getAuthDb()
  const reserved = await db.getJobLedgerAmount({
    userId: input.userId,
    jobId: input.jobId,
    resource: input.resource,
    action: "reserve",
  })
  const consumed = await db.getJobLedgerAmount({
    userId: input.userId,
    jobId: input.jobId,
    resource: input.resource,
    action: "consume",
  })
  const refunded = await db.getJobLedgerAmount({
    userId: input.userId,
    jobId: input.jobId,
    resource: input.resource,
    action: "refund",
  })
  const refundable = Math.max(0, reserved + consumed - refunded)
  const requested = input.amount === undefined ? refundable : Math.max(0, Math.min(input.amount, refundable))
  if (!Number.isInteger(requested) || requested <= 0) return 0
  await db.addQuotaLedger({
    userId: input.userId,
    jobId: input.jobId,
    resource: input.resource,
    action: "refund",
    amount: requested,
    reason: input.reason,
  })
  return requested
}

export async function ensureQuotaAvailable(context: AuthContext, resource: QuotaResource, amount: number): Promise<void> {
  await ensureUserQuotaAvailable(context.user.id, resource, amount)
}

export async function ensureUserQuotaAvailable(userId: string, resource: QuotaResource, amount: number): Promise<void> {
  assertPositiveAmount(amount, "额度消耗")
  const db = await getAuthDb()
  const snapshot = await db.getQuotaSnapshot(userId)
  const remaining = resource === "upload_bytes"
    ? snapshot.remaining.uploadBytes
    : resource === "ocr_jobs"
      ? snapshot.remaining.ocrJobs
      : snapshot.remaining.ocrPages
  if (remaining < amount) {
    throw new AppError("当前账号额度不足，请联系管理员调整额度", { status: 402, code: "QUOTA_EXHAUSTED" })
  }
}

function assertPositiveAmount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new AppError(`${label}必须是正整数`, { status: 400, code: "INVALID_QUOTA_AMOUNT" })
  }
}
