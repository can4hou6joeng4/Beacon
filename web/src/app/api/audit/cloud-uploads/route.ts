import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAuth } from "@/lib/auth"
import { getAuditDb } from "@/lib/audit-db"
import {
  assertObjectStoreConfigured,
  createCloudObjectStoreConfig,
  createPresignedPutUrl,
  generateAuditObjectKey,
  getCloudDirectUploadMode,
  validateCloudUploadInput,
} from "@/lib/cloud-object-store"
import { ensureQuotaAvailable, reserveUploadQuota } from "@/lib/quota"
import { createServerTimingTracker, responseWithServerTiming } from "@/lib/server-timing"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const timing = createServerTimingTracker()
  try {
    const context = await requireAuth(request)
    const payload = (await request.json().catch(() => null)) as { filename?: string; size?: number; contentType?: string; cutoff?: string } | null
    const input = validateCloudUploadInput(payload || {})
    const cutoff = parseCutoff(payload?.cutoff)
    const config = createCloudObjectStoreConfig()
    assertObjectStoreConfigured(config)
    const jobId = crypto.randomUUID()
    const objectKey = generateAuditObjectKey({ filename: input.filename, prefix: config.prefix, jobId })
    await timing.measure("quota_check", () => ensureQuotaAvailable(context, "upload_bytes", input.size), "upload quota check")
    const db = await timing.measure("db_init", () => getAuditDb(), "audit db")
    const job = await timing.measure("d1_create_job", () => db.createJob({
      id: jobId,
      filename: input.filename,
      cutoff,
      userId: context.user.id,
      runtime: "paddleocr",
      objectKey,
      uploadBytes: input.size,
    }), "create job")
    await timing.measure("quota_reserve", () => reserveUploadQuota({ context, jobId: job.id, bytes: input.size }), "reserve upload quota")
    const uploadMode = getCloudDirectUploadMode(config)
    const upload = uploadMode === "worker"
      ? {
          url: `/api/audit/cloud-uploads/${encodeURIComponent(job.id)}/file`,
          expiresAt: new Date(Date.now() + config.uploadExpiresSeconds * 1000).toISOString(),
        }
      : createPresignedPutUrl({ objectKey, contentType: input.contentType, config })

    return responseWithServerTiming(NextResponse.json({
      jobId: job.id,
      objectKey,
      uploadUrl: upload.url,
      uploadExpiresAt: upload.expiresAt,
      method: "PUT",
      headers: { "Content-Type": input.contentType },
      uploadMode,
    }), timing)
  } catch (error) {
    return jsonError(error, "创建云端上传会话失败")
  }
}

function parseCutoff(value: string | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("无效的截止日期")
  }
  return value
}
