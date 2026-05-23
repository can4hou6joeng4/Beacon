import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { analyzePaddleOcrJsonl } from "@/lib/audit-analyzer"
import { requireAuth } from "@/lib/auth"
import { getAuditDb } from "@/lib/audit-db"
import { stageFromStatus } from "@/lib/audit-python"
import {
  createCloudObjectStoreConfig,
  fetchCloudObjectText,
  putCloudObjectText,
  siblingObjectKey,
} from "@/lib/cloud-object-store"
import { fetchPaddleOcrJobSnapshot, fetchText } from "@/lib/paddleocr"
import { createPaddleOcrRuntimeConfig } from "@/lib/paddleocr-runtime"
import { consumeOcrPageQuota } from "@/lib/quota"

export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAuth(request)
    const { id } = await params
    const db = await getAuditDb()
    const job = await db.getJobForUser(id, context.user.id, context.user.role)
    if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 })

    if (job.runtime === "paddleocr") {
      if (!job.providerJobId) return NextResponse.json({ error: "PaddleOCR 任务不存在" }, { status: 404 })
      const snapshot = await fetchPaddleOcrJobSnapshot({
        providerJobId: job.providerJobId,
        config: await createPaddleOcrRuntimeConfig(),
      })
      let updated = await db.updateFromStatus(id, { status: snapshot.status, message: snapshot.message })
      if (snapshot.status === "complete" && snapshot.jsonUrl && job.objectKey) {
        const config = createCloudObjectStoreConfig()
        const resultKey = siblingObjectKey({ objectKey: job.objectKey, filename: "result.json", prefix: config.prefix })
        const existingResult = await fetchCloudObjectText({ objectKey: resultKey, config }).catch(() => null)
        if (!existingResult) {
          const jsonl = await fetchText(snapshot.jsonUrl)
          const analyzed = analyzePaddleOcrJsonl({ jobId: id, cutoff: job.cutoff, jsonl })
          const pagesUsed = await consumeOcrPageQuota({
            context,
            jobId: id,
            userId: job.userId ?? context.user.id,
            pages: analyzed.result.summary.ocr_total_pages ?? analyzed.result.summary.pages_ocr,
          })
          const ocrKey = siblingObjectKey({ objectKey: job.objectKey, filename: "ocr.txt", prefix: config.prefix })
          const csvKey = siblingObjectKey({ objectKey: job.objectKey, filename: "matches.csv", prefix: config.prefix })
          const rawKey = siblingObjectKey({ objectKey: job.objectKey, filename: "paddleocr.jsonl", prefix: config.prefix })
          await Promise.all([
            putCloudObjectText({ objectKey: rawKey, content: jsonl, contentType: "application/x-ndjson; charset=utf-8", config }),
            putCloudObjectText({ objectKey: ocrKey, content: analyzed.ocrText, contentType: "text/plain; charset=utf-8", config }),
            putCloudObjectText({ objectKey: csvKey, content: analyzed.csv, contentType: "text/csv; charset=utf-8", config }),
            putCloudObjectText({
              objectKey: resultKey,
              content: JSON.stringify(analyzed.result, null, 2),
              contentType: "application/json; charset=utf-8",
              config,
            }),
          ])
          updated = await db.updateFromResult(id, analyzed.result.summary)
          updated = await db.updateOcrPagesUsed(id, pagesUsed)
        }
      }
      return NextResponse.json({
        job: updated,
        status: { status: snapshot.status, message: snapshot.message },
        stage: stageFromStatus({ status: snapshot.status, message: snapshot.message }),
        snapshot,
      })
    }

    return NextResponse.json({ error: "本机 OCR 状态查询已停用，请使用云端 PaddleOCR 任务" }, { status: 410 })
  } catch (error) {
    return jsonError(error, "读取任务状态失败")
  }
}
