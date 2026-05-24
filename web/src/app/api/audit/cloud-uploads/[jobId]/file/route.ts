import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAuth } from "@/lib/auth"
import { getAuditDb } from "@/lib/audit-db"
import { AppError } from "@/lib/app-error"
import {
  assertObjectStoreConfigured,
  createCloudObjectStoreConfig,
  putCloudObjectStream,
} from "@/lib/cloud-object-store"
import { refundQuotaOnce } from "@/lib/quota"
import { createServerTimingTracker, responseWithServerTiming } from "@/lib/server-timing"

export const runtime = "nodejs"

export async function PUT(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  let refundTarget: { userId: string; jobId: string; amount: number } | null = null
  const timing = createServerTimingTracker()
  try {
    const context = await requireAuth(request)
    const { jobId } = await params
    const config = createCloudObjectStoreConfig()
    assertObjectStoreConfigured(config)
    if (config.driver !== "r2-binding") {
      throw new AppError("当前对象存储模式不支持 Worker 上传", { status: 409, code: "UNSUPPORTED_UPLOAD_MODE" })
    }

    const db = await getAuditDb()
    const job = await db.getJobForUser(jobId, context.user.id, context.user.role)
    if (!job) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 })
    }
    if (job.runtime !== "paddleocr" || !job.objectKey) {
      return NextResponse.json({ error: "任务不支持云端 PDF 上传" }, { status: 400 })
    }
    if (job.status === "failed" || job.status === "complete" || job.providerJobId) {
      return NextResponse.json({ error: "当前任务状态不允许上传 PDF" }, { status: 409 })
    }

    refundTarget = {
      userId: job.userId ?? context.user.id,
      jobId: job.id,
      amount: job.uploadBytes,
    }

    const contentType = normalizeContentType(request.headers.get("content-type"))
    if (contentType !== "application/pdf" && contentType !== "application/octet-stream") {
      throw new AppError("请上传 PDF 文件", { status: 400, code: "INVALID_UPLOAD_TYPE" })
    }

    const contentLength = parseContentLength(request.headers.get("content-length"))
    if (contentLength !== null && contentLength < 1) {
      throw new AppError("上传文件为空", { status: 400, code: "EMPTY_UPLOAD" })
    }
    if (contentLength !== null && contentLength > 100 * 1024 * 1024) {
      throw new AppError("PDF 文件超过当前 100MB 上传限制", { status: 400, code: "UPLOAD_TOO_LARGE" })
    }
    if (contentLength !== null && contentLength !== job.uploadBytes) {
      throw new AppError("上传文件大小与会话记录不一致，请重新创建上传任务", { status: 409, code: "UPLOAD_SIZE_MISMATCH" })
    }
    if (!request.body) {
      throw new AppError("上传请求缺少文件内容", { status: 400, code: "EMPTY_UPLOAD" })
    }
    const uploadBody = request.body
    const objectKey = job.objectKey

    await timing.measure("r2_put", () => putCloudObjectStream({
      objectKey,
      stream: uploadBody,
      contentType: "application/pdf",
      config,
    }), "stream upload to r2")
    const updated = await timing.measure("d1_status", () => db.updateFromStatus(job.id, {
      status: "queued",
      message: "PDF 已上传，等待提交 PaddleOCR",
    }), "upload status update")
    refundTarget = null

    return responseWithServerTiming(NextResponse.json({ job: updated ?? job, objectKey, size: contentLength ?? job.uploadBytes }), timing)
  } catch (error) {
    if (refundTarget) {
      const db = await getAuditDb().catch(() => null)
      await refundQuotaOnce({
        ...refundTarget,
        resource: "upload_bytes",
        reason: "cloud_upload_failed",
      }).catch(() => undefined)
      await db?.updateFromStatus(refundTarget.jobId, {
        status: "failed",
        message: "PDF 上传到 R2 失败，已回退上传额度",
      }).catch(() => undefined)
    }
    return jsonError(error, "上传 PDF 到 R2 失败")
  }
}

function normalizeContentType(value: string | null): string {
  return (value || "application/pdf").split(";")[0]?.trim().toLowerCase() || "application/pdf"
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}
