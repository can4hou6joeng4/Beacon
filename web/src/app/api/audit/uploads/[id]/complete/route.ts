import { NextResponse } from "next/server"
import { isAuthorized } from "@/lib/audit-auth"
import { getAuditDb } from "@/lib/audit-db"
import { createPythonJobFromBlob } from "@/lib/audit-python"
import { cleanupUpload, completeUpload } from "@/lib/upload-store"

export const runtime = "nodejs"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let uploadId = ""
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "未授权，请使用带 token 的链接访问" }, { status: 401 })
    }

    const { id } = await params
    uploadId = id
    const payload = (await request.json().catch(() => null)) as { cutoff?: string; totalChunks?: number } | null
    const cutoff = payload?.cutoff || "2026-05-07"
    const totalChunks = Number(payload?.totalChunks)

    const upload = completeUpload(uploadId, totalChunks)
    const db = getAuditDb()
    const job = db.createJob({ filename: upload.metadata.filename, cutoff })
    const python = await createPythonJobFromBlob({
      filename: upload.metadata.filename,
      cutoff,
      contentType: upload.metadata.contentType,
      blob: upload.blob,
    })
    const updated = db.attachPythonJob(job.id, python.job_id)
    upload.cleanup()

    return NextResponse.json({ job: updated })
  } catch (error) {
    if (uploadId) {
      try {
        cleanupUpload(uploadId)
      } catch {
        // Ignore best-effort cleanup failures.
      }
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建任务失败" }, { status: 500 })
  }
}
