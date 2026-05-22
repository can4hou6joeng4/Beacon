import { NextResponse } from "next/server"
import { isAuthorized } from "@/lib/audit-auth"
import { getAuditDb } from "@/lib/audit-db"
import {
  assertObjectStoreConfigured,
  assertSafeObjectKey,
  createCloudObjectStoreConfig,
  createPresignedGetUrl,
} from "@/lib/cloud-object-store"
import { submitPaddleOcrUrlJob } from "@/lib/paddleocr"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "未授权，请使用带 token 的链接访问" }, { status: 401 })
    }

    const payload = (await request.json().catch(() => null)) as { objectKey?: string; filename?: string; cutoff?: string } | null
    if (!payload?.objectKey) {
      return NextResponse.json({ error: "缺少对象存储路径" }, { status: 400 })
    }

    const config = createCloudObjectStoreConfig()
    assertObjectStoreConfigured(config)
    assertSafeObjectKey(payload.objectKey, config.prefix)
    const fileUrl = createPresignedGetUrl({ objectKey: payload.objectKey, config })
    const submitted = await submitPaddleOcrUrlJob({ fileUrl: fileUrl.url })
    const db = await getAuditDb()
    const job = await db.createJob({
      filename: payload.filename || payload.objectKey.split("/").at(-1) || "input.pdf",
      cutoff: payload.cutoff || "2026-05-07",
      runtime: "paddleocr",
      objectKey: payload.objectKey,
    })
    const updated = await db.attachProviderJob(job.id, submitted.providerJobId)

    return NextResponse.json({
      job: updated,
      objectKey: payload.objectKey,
      fileUrlExpiresAt: fileUrl.expiresAt,
      ...submitted,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "提交云端 OCR 任务失败" }, { status: 500 })
  }
}
