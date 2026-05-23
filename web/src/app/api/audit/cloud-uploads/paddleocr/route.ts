import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAuth } from "@/lib/auth"
import { getAuditDb } from "@/lib/audit-db"
import {
  assertObjectStoreConfigured,
  assertSafeObjectKey,
  createCloudObjectStoreConfig,
  createPresignedGetUrl,
} from "@/lib/cloud-object-store"
import { submitPaddleOcrUrlJob } from "@/lib/paddleocr"
import { consumeOcrJobQuota, refundQuota } from "@/lib/quota"

export const runtime = "nodejs"

export async function POST(request: Request) {
  let quotaRefund: { userId: string; jobId: string } | null = null
  try {
    const context = await requireAuth(request)
    const payload = (await request.json().catch(() => null)) as { jobId?: string; objectKey?: string } | null
    if (!payload?.jobId) {
      return NextResponse.json({ error: "缺少任务 ID" }, { status: 400 })
    }
    if (!payload.objectKey) {
      return NextResponse.json({ error: "缺少对象存储路径" }, { status: 400 })
    }

    const config = createCloudObjectStoreConfig()
    assertObjectStoreConfigured(config)
    assertSafeObjectKey(payload.objectKey, config.prefix)
    const db = await getAuditDb()
    const job = await db.getJobForUser(payload.jobId, context.user.id, context.user.role)
    if (!job || job.objectKey !== payload.objectKey) {
      return NextResponse.json({ error: "任务不存在或对象路径不匹配" }, { status: 404 })
    }
    if (job.providerJobId) {
      return NextResponse.json({ job, objectKey: payload.objectKey, providerJobId: job.providerJobId })
    }

    await consumeOcrJobQuota({ context, jobId: job.id })
    quotaRefund = { userId: context.user.id, jobId: job.id }
    const fileUrl = createPresignedGetUrl({ objectKey: payload.objectKey, config })
    const submitted = await submitPaddleOcrUrlJob({ fileUrl: fileUrl.url })
    const updated = await db.attachProviderJob(job.id, submitted.providerJobId)
    quotaRefund = null

    return NextResponse.json({
      job: updated,
      objectKey: payload.objectKey,
      fileUrlExpiresAt: fileUrl.expiresAt,
      ...submitted,
    })
  } catch (error) {
    if (quotaRefund) {
      await refundQuota({ ...quotaRefund, resource: "ocr_jobs", amount: 1, reason: "paddleocr_submission_failed" }).catch(() => undefined)
    }
    return jsonError(error, "提交云端 OCR 任务失败")
  }
}
