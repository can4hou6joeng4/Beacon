import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAuth } from "@/lib/auth"
import { getAuditDb } from "@/lib/audit-db"
import { resultDistribution } from "@/lib/audit-python"
import { createCloudObjectStoreConfig, fetchCloudObjectText, siblingObjectKey } from "@/lib/cloud-object-store"
import type { AuditResult } from "@/lib/audit-types"

export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAuth(request)
    const { id } = await params
    const db = await getAuditDb()
    const job = await db.getJobForUser(id, context.user.id, context.user.role)
    if (job?.runtime === "paddleocr") {
      if (!job.objectKey) return NextResponse.json({ error: "云端任务缺少对象路径" }, { status: 404 })
      const config = createCloudObjectStoreConfig()
      const resultKey = siblingObjectKey({ objectKey: job.objectKey, filename: "result.json", prefix: config.prefix })
      const result = JSON.parse(await fetchCloudObjectText({ objectKey: resultKey, config })) as AuditResult
      const updated = await db.updateFromResult(id, result.summary)
      return NextResponse.json({
        job: updated,
        result,
        distribution: resultDistribution(result.summary),
      })
    }
    if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 })
    return NextResponse.json({ error: "本机 OCR 历史结果读取已停用，请使用云端 PaddleOCR 任务" }, { status: 410 })
  } catch (error) {
    return jsonError(error, "读取结果失败")
  }
}
