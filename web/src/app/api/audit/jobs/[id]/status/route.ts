import { NextResponse } from "next/server"
import { analyzePaddleOcrJsonl } from "@/lib/audit-analyzer"
import { getAuditDb } from "@/lib/audit-db"
import { fetchPythonStatus, stageFromStatus } from "@/lib/audit-python"
import {
  createCloudObjectStoreConfig,
  fetchCloudObjectText,
  putCloudObjectText,
  siblingObjectKey,
} from "@/lib/cloud-object-store"
import { fetchPaddleOcrJobSnapshot, fetchText } from "@/lib/paddleocr"

export const runtime = "nodejs"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = await getAuditDb()
    const job = await db.getJob(id)
    if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 })

    if (job.runtime === "paddleocr") {
      if (!job.providerJobId) return NextResponse.json({ error: "PaddleOCR 任务不存在" }, { status: 404 })
      const snapshot = await fetchPaddleOcrJobSnapshot({ providerJobId: job.providerJobId })
      let updated = await db.updateFromStatus(id, { status: snapshot.status, message: snapshot.message })
      if (snapshot.status === "complete" && snapshot.jsonUrl && job.objectKey) {
        const config = createCloudObjectStoreConfig()
        const resultKey = siblingObjectKey({ objectKey: job.objectKey, filename: "result.json", prefix: config.prefix })
        const existingResult = await fetchCloudObjectText({ objectKey: resultKey, config }).catch(() => null)
        if (!existingResult) {
          const jsonl = await fetchText(snapshot.jsonUrl)
          const analyzed = analyzePaddleOcrJsonl({ jobId: id, cutoff: job.cutoff, jsonl })
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
        }
      }
      return NextResponse.json({
        job: updated,
        status: { status: snapshot.status, message: snapshot.message },
        stage: stageFromStatus({ status: snapshot.status, message: snapshot.message }),
        snapshot,
      })
    }

    if (!job.pythonJobId) return NextResponse.json({ error: "任务不存在" }, { status: 404 })

    const status = await fetchPythonStatus(job.pythonJobId)
    const updated = await db.updateFromStatus(id, status)
    return NextResponse.json({ job: updated, status, stage: stageFromStatus(status) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取任务状态失败" }, { status: 500 })
  }
}
