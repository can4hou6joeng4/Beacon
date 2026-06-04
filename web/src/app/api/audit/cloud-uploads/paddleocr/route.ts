import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAuth } from "@/lib/auth"
import { getAuditDb } from "@/lib/audit-db"
import { assertJobObjectKeyMatches, requireAuditJobForUser } from "@/lib/audit-isolation"
import {
  assertObjectStoreConfigured,
  assertSafeObjectKey,
  createCloudObjectStoreConfig,
  createPresignedGetUrl,
  fetchCloudObjectBlob,
  getCloudDirectUploadMode,
} from "@/lib/cloud-object-store"
import { submitPaddleOcrFileJob, submitPaddleOcrUrlJob } from "@/lib/paddleocr"
import { createPaddleOcrRuntimeConfig } from "@/lib/paddleocr-runtime"
import { consumeOcrJobQuota, refundQuotaOnce } from "@/lib/quota"
import { createServerTimingTracker, responseWithServerTiming } from "@/lib/server-timing"

export const runtime = "nodejs"

export async function POST(request: Request) {
  let quotaRefund: { userId: string; jobId: string } | null = null
  let failureJobId: string | null = null
  const timing = createServerTimingTracker()
  try {
    const context = await requireAuth(request)
    const payload = (await request.json().catch(() => null)) as { jobId?: string; objectKey?: string } | null
    if (!payload?.jobId) {
      return NextResponse.json({ error: "缺少任务 ID" }, { status: 400 })
    }
    if (!payload.objectKey) {
      return NextResponse.json({ error: "缺少对象存储路径" }, { status: 400 })
    }
    const jobId = payload.jobId
    const objectKey = payload.objectKey

    const config = createCloudObjectStoreConfig()
    assertObjectStoreConfigured(config)
    assertSafeObjectKey(objectKey, config.prefix)
    const db = await timing.measure("db_init", () => getAuditDb(), "audit db")
    const job = await timing.measure(
      "d1_get_job",
      () => requireAuditJobForUser({
        db,
        jobId,
        userId: context.user.id,
        role: context.user.role,
        notFoundMessage: "任务不存在或对象路径不匹配",
      }),
      "load job",
    )
    assertJobObjectKeyMatches(job, objectKey)
    failureJobId = job.id
    if (job.providerJobId) {
      return responseWithServerTiming(NextResponse.json({ job, objectKey, providerJobId: job.providerJobId }), timing)
    }

    const quotaUserId = job.userId ?? context.user.id
    await timing.measure("quota_consume_job", () => consumeOcrJobQuota({ context, jobId: job.id, userId: quotaUserId }), "consume ocr job quota")
    quotaRefund = { userId: quotaUserId, jobId: job.id }
    const paddleOcrConfig = await timing.measure("paddle_config", () => createPaddleOcrRuntimeConfig(), "provider config")
    const uploadMode = getCloudDirectUploadMode(config)
    const submitted = await timing.measure("paddle_submit", async () => uploadMode === "r2-presigned"
      ? submitPaddleOcrUrlJob({
          config: paddleOcrConfig,
          fileUrl: createPresignedGetUrl({ objectKey, config }).url,
        })
      : submitPaddleOcrFileJob({
          filename: job.filename,
          config: paddleOcrConfig,
          file: (await fetchCloudObjectBlob({
            objectKey,
            config,
            fallbackContentType: "application/pdf",
          })).blob,
        }), "submit provider job")
    const updated = await timing.measure("d1_provider_job", () => db.attachProviderJob(job.id, submitted.providerJobId), "attach provider job")
    quotaRefund = null

    return responseWithServerTiming(NextResponse.json({
      job: updated,
      objectKey,
      ...submitted,
    }), timing)
  } catch (error) {
    if (quotaRefund) {
      await refundQuotaOnce({ ...quotaRefund, resource: "ocr_jobs", amount: 1, reason: "paddleocr_submission_failed" }).catch(() => undefined)
    }
    if (failureJobId) {
      const message = error instanceof Error ? error.message : "PaddleOCR 任务提交失败"
      const db = await getAuditDb().catch(() => null)
      await db?.updateFromStatus(failureJobId, {
        status: "failed",
        message,
      }).catch(() => undefined)
    }
    return jsonError(error, "提交云端 OCR 任务失败")
  }
}
