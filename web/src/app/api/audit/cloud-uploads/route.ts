import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAuth } from "@/lib/auth"
import { getAuditDb } from "@/lib/audit-db"
import {
  assertObjectStoreConfigured,
  createCloudObjectStoreConfig,
  createPresignedPutUrl,
  generateAuditObjectKey,
  validateCloudUploadInput,
} from "@/lib/cloud-object-store"
import { ensureQuotaAvailable, reserveUploadQuota } from "@/lib/quota"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const context = await requireAuth(request)
    const payload = (await request.json().catch(() => null)) as { filename?: string; size?: number; contentType?: string; cutoff?: string } | null
    const input = validateCloudUploadInput(payload || {})
    const cutoff = parseCutoff(payload?.cutoff)
    const config = createCloudObjectStoreConfig()
    assertObjectStoreConfigured(config)
    const jobId = crypto.randomUUID()
    const objectKey = generateAuditObjectKey({ filename: input.filename, prefix: config.prefix, jobId })
    await ensureQuotaAvailable(context, "upload_bytes", input.size)
    const db = await getAuditDb()
    const job = await db.createJob({
      id: jobId,
      filename: input.filename,
      cutoff,
      userId: context.user.id,
      runtime: "paddleocr",
      objectKey,
      uploadBytes: input.size,
    })
    await reserveUploadQuota({ context, jobId: job.id, bytes: input.size })
    const upload = config.driver === "r2-binding"
      ? {
          url: `/api/audit/cloud-uploads/${encodeURIComponent(job.id)}/file`,
          expiresAt: new Date(Date.now() + config.uploadExpiresSeconds * 1000).toISOString(),
        }
      : createPresignedPutUrl({ objectKey, contentType: input.contentType, config })

    return NextResponse.json({
      jobId: job.id,
      objectKey,
      uploadUrl: upload.url,
      uploadExpiresAt: upload.expiresAt,
      method: "PUT",
      headers: { "Content-Type": input.contentType },
    })
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
