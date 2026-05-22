import { NextResponse } from "next/server"
import { isAuthorized } from "@/lib/audit-auth"
import { getAuditDb } from "@/lib/audit-db"
import { createPythonJobFromBlob } from "@/lib/audit-python"

export const runtime = "nodejs"

function localUploadsEnabled(): boolean {
  return (process.env.AUDIT_RUNTIME_MODE ?? "local-python") === "local-python"
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let uploadId = ""
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "未授权，请使用带 token 的链接访问" }, { status: 401 })
    }
    if (!localUploadsEnabled()) {
      return NextResponse.json({ error: "云端运行模式请使用 /api/audit/cloud-uploads/paddleocr" }, { status: 409 })
    }

    const { id } = await params
    uploadId = id
    const payload = (await request.json().catch(() => null)) as { cutoff?: string; totalChunks?: number } | null
    const cutoff = payload?.cutoff || "2026-05-07"
    const totalChunks = Number(payload?.totalChunks)

    const { completeUpload } = await import("@/lib/upload-store")
    const upload = completeUpload(uploadId, totalChunks)
    const db = await getAuditDb()
    const job = await db.createJob({ filename: upload.metadata.filename, cutoff })
    const python = await createPythonJobFromBlob({
      filename: upload.metadata.filename,
      cutoff,
      contentType: upload.metadata.contentType,
      blob: upload.blob,
    })
    const updated = await db.attachPythonJob(job.id, python.job_id)
    upload.cleanup()

    return NextResponse.json({ job: updated })
  } catch (error) {
    if (uploadId) {
      try {
        const { cleanupUpload } = await import("@/lib/upload-store")
        cleanupUpload(uploadId)
      } catch {
        // Ignore best-effort cleanup failures.
      }
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建任务失败" }, { status: 500 })
  }
}
