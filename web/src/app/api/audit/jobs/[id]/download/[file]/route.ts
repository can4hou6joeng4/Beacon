import { NextResponse } from "next/server"
import { getAuditDb } from "@/lib/audit-db"
import { fetchPythonDownload } from "@/lib/audit-python"
import { createCloudObjectStoreConfig, createPresignedGetUrl, siblingObjectKey } from "@/lib/cloud-object-store"

export const runtime = "nodejs"

const allowed = new Set(["matches.csv", "result.json", "ocr.txt", "manifest.json"])

export async function GET(_: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  try {
    const { id, file } = await params
    if (!allowed.has(file)) return NextResponse.json({ error: "不支持的下载文件" }, { status: 400 })

    const db = await getAuditDb()
    const job = await db.getJob(id)
    if (job?.runtime === "paddleocr") {
      if (!job.objectKey) return NextResponse.json({ error: "云端任务缺少对象路径" }, { status: 404 })
      const config = createCloudObjectStoreConfig()
      const objectKey = siblingObjectKey({ objectKey: job.objectKey, filename: file, prefix: config.prefix })
      const download = createPresignedGetUrl({ objectKey, config })
      return NextResponse.redirect(download.url)
    }
    if (!job || !job.pythonJobId) return NextResponse.json({ error: "任务不存在" }, { status: 404 })

    const response = await fetchPythonDownload(job.pythonJobId, file)
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
        "Content-Disposition": `attachment; filename=${file}`,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "下载失败" }, { status: 500 })
  }
}
