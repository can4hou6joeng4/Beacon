import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { analyzePaddleOcrJsonl } from "@/lib/audit-analyzer"
import { requireAuth } from "@/lib/auth"
import { getAuditDb } from "@/lib/audit-db"
import { stageFromStatus } from "@/lib/audit-progress"
import {
  createCloudObjectStoreConfig,
  fetchCloudObjectText,
  putCloudObjectText,
  siblingObjectKey,
} from "@/lib/cloud-object-store"
import { fetchPaddleOcrJobSnapshot, fetchText, toPaddleOcrProviderProgress } from "@/lib/paddleocr"
import { createPaddleOcrRuntimeConfig } from "@/lib/paddleocr-runtime"
import { consumeOcrPageQuota } from "@/lib/quota"
import { createServerTimingTracker, responseWithServerTiming } from "@/lib/server-timing"

export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const timing = createServerTimingTracker()
  try {
    const context = await requireAuth(request)
    const { id } = await params
    const db = await timing.measure("db_init", () => getAuditDb(), "audit db")
    const job = await timing.measure("d1_get_job", () => db.getJobForUser(id, context.user.id, context.user.role), "load job")
    if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 })

    if (job.runtime === "paddleocr") {
      if (!job.providerJobId) return NextResponse.json({ error: "PaddleOCR 任务不存在" }, { status: 404 })
      const providerJobId = job.providerJobId
      const paddleConfig = await timing.measure("paddle_config", () => createPaddleOcrRuntimeConfig(), "provider config")
      const snapshot = await timing.measure("paddle_status", () => fetchPaddleOcrJobSnapshot({
        providerJobId,
        config: paddleConfig,
      }), "provider status")
      let updated = await timing.measure("d1_status", () => db.updateFromStatus(id, { status: snapshot.status, message: snapshot.message }), "status update")
      if (snapshot.status === "complete" && snapshot.jsonUrl && job.objectKey) {
        const objectKey = job.objectKey
        const config = createCloudObjectStoreConfig()
        const resultKey = siblingObjectKey({ objectKey, filename: "result.json", prefix: config.prefix })
        const existingResult = await timing.measure("r2_result_check", () => fetchCloudObjectText({ objectKey: resultKey, config }).catch(() => null), "result artifact check")
        if (!existingResult) {
          const jsonUrl = snapshot.jsonUrl
          const jsonl = await timing.measure("paddle_result_fetch", () => fetchText(jsonUrl), "provider result fetch")
          const analyzed = await timing.measure("analyze_result", async () => analyzePaddleOcrJsonl({ jobId: id, cutoff: job.cutoff, jsonl }), "analyze ocr")
          const pagesUsed = await timing.measure("quota_consume_pages", () => consumeOcrPageQuota({
            context,
            jobId: id,
            userId: job.userId ?? context.user.id,
            pages: analyzed.result.summary.ocr_total_pages ?? analyzed.result.summary.pages_ocr,
          }), "consume ocr page quota")
          const ocrKey = siblingObjectKey({ objectKey, filename: "ocr.txt", prefix: config.prefix })
          const csvKey = siblingObjectKey({ objectKey, filename: "matches.csv", prefix: config.prefix })
          const rawKey = siblingObjectKey({ objectKey, filename: "paddleocr.jsonl", prefix: config.prefix })
          await timing.measure("r2_artifacts_put", () => Promise.all([
            putCloudObjectText({ objectKey: rawKey, content: jsonl, contentType: "application/x-ndjson; charset=utf-8", config }),
            putCloudObjectText({ objectKey: ocrKey, content: analyzed.ocrText, contentType: "text/plain; charset=utf-8", config }),
            putCloudObjectText({ objectKey: csvKey, content: analyzed.csv, contentType: "text/csv; charset=utf-8", config }),
            putCloudObjectText({
              objectKey: resultKey,
              content: JSON.stringify(analyzed.result, null, 2),
              contentType: "application/json; charset=utf-8",
              config,
            }),
          ]), "write artifacts")
          updated = await timing.measure("d1_result", () => db.updateFromResult(id, analyzed.result.summary), "result summary")
          updated = await timing.measure("d1_pages_used", () => db.updateOcrPagesUsed(id, pagesUsed), "pages used")
        }
      }
      return responseWithServerTiming(NextResponse.json({
        job: updated,
        status: { status: snapshot.status, message: snapshot.message },
        stage: stageFromStatus({ status: snapshot.status, message: snapshot.message }),
        providerProgress: toPaddleOcrProviderProgress(snapshot),
      }), timing)
    }

    return NextResponse.json({ error: "本机 OCR 状态查询已停用，请使用云端 PaddleOCR 任务" }, { status: 410 })
  } catch (error) {
    return jsonError(error, "读取任务状态失败")
  }
}
