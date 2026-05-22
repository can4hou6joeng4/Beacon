import { NextResponse } from "next/server"
import { isAuthorized } from "@/lib/audit-auth"
import {
  assertObjectStoreConfigured,
  createCloudObjectStoreConfig,
  createPresignedPutUrl,
  generateAuditObjectKey,
  validateCloudUploadInput,
} from "@/lib/cloud-object-store"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "未授权，请使用带 token 的链接访问" }, { status: 401 })
    }

    const payload = (await request.json().catch(() => null)) as { filename?: string; size?: number; contentType?: string } | null
    const input = validateCloudUploadInput(payload || {})
    const config = createCloudObjectStoreConfig()
    assertObjectStoreConfigured(config)
    const objectKey = generateAuditObjectKey({ filename: input.filename, prefix: config.prefix })
    const upload = createPresignedPutUrl({ objectKey, contentType: input.contentType, config })

    return NextResponse.json({
      objectKey,
      uploadUrl: upload.url,
      uploadExpiresAt: upload.expiresAt,
      method: "PUT",
      headers: { "Content-Type": input.contentType },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建云端上传会话失败" }, { status: 500 })
  }
}
