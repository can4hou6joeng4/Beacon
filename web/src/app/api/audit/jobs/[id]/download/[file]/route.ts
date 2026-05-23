import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAuth } from "@/lib/auth"
import { getAuditDb } from "@/lib/audit-db"
import { createCloudObjectStoreConfig, createPresignedGetUrl, siblingObjectKey } from "@/lib/cloud-object-store"

export const runtime = "nodejs"

const allowed = new Set(["matches.csv", "result.json", "ocr.txt", "manifest.json"])

export async function GET(request: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  try {
    const context = await requireAuth(request)
    const { id, file } = await params
    if (!allowed.has(file)) return NextResponse.json({ error: "不支持的下载文件" }, { status: 400 })

    const db = await getAuditDb()
    const job = await db.getJobForUser(id, context.user.id, context.user.role)
    if (job?.runtime === "paddleocr") {
      if (!job.objectKey) return NextResponse.json({ error: "云端任务缺少对象路径" }, { status: 404 })
      const config = createCloudObjectStoreConfig()
      const objectKey = siblingObjectKey({ objectKey: job.objectKey, filename: file, prefix: config.prefix })
      const download = createPresignedGetUrl({ objectKey, config })
      return NextResponse.redirect(download.url)
    }
    if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 })
    return NextResponse.json({ error: "本机 OCR 文件下载已停用，请使用云端 PaddleOCR 任务" }, { status: 410 })
  } catch (error) {
    return jsonError(error, "下载失败")
  }
}
