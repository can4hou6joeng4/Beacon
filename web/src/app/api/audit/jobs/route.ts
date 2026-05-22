import { NextResponse } from "next/server"
import { isAuthorized } from "@/lib/audit-auth"
import { getAuditDb } from "@/lib/audit-db"
import { createPythonJob } from "@/lib/audit-python"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "未授权，请使用带 token 的链接访问" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("pdf")
    const cutoff = String(formData.get("cutoff") || "2026-05-07")
    if (!(file instanceof File) || !file.name) {
      return NextResponse.json({ error: "请上传 PDF 文件" }, { status: 400 })
    }

    const db = getAuditDb()
    const job = db.createJob({ filename: file.name, cutoff })
    const python = await createPythonJob(formData)
    const updated = db.attachPythonJob(job.id, python.job_id)
    return NextResponse.json({ job: updated })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建任务失败" }, { status: 500 })
  }
}
