import { NextResponse } from "next/server"
import { getAuditDb } from "@/lib/audit-db"
import { fetchPythonResult, resultDistribution } from "@/lib/audit-python"
import { createCloudObjectStoreConfig, fetchCloudObjectText, siblingObjectKey } from "@/lib/cloud-object-store"
import type { AuditResult } from "@/lib/audit-types"

export const runtime = "nodejs"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const db = getAuditDb()
    const job = db.getJob(id)
    if (job?.runtime === "paddleocr") {
      if (!job.objectKey) return NextResponse.json({ error: "云端任务缺少对象路径" }, { status: 404 })
      const config = createCloudObjectStoreConfig()
      const resultKey = siblingObjectKey({ objectKey: job.objectKey, filename: "result.json", prefix: config.prefix })
      const result = JSON.parse(await fetchCloudObjectText({ objectKey: resultKey, config })) as AuditResult
      const updated = db.updateFromResult(id, result.summary)
      return NextResponse.json({
        job: updated,
        result,
        distribution: resultDistribution(result.summary),
      })
    }
    if (!job || !job.pythonJobId) return NextResponse.json({ error: "任务不存在" }, { status: 404 })

    const result = await fetchPythonResult(job.pythonJobId)
    const updated = db.updateFromResult(id, result.summary, {
      certificate_pages: result.manifest?.certificate_pages,
    })

    return NextResponse.json({
      job: updated,
      result,
      distribution: resultDistribution(result.summary),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取结果失败" }, { status: 500 })
  }
}
