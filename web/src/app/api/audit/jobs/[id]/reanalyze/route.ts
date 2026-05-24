import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { reanalyzePaddleOcrJobArtifacts } from "@/lib/audit-reanalysis"
import { requireAuth } from "@/lib/auth"
import { getAuditDb } from "@/lib/audit-db"

export const runtime = "nodejs"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAuth(request)
    const { id } = await params
    const db = await getAuditDb()
    const job = await db.getJobForUser(id, context.user.id, context.user.role)
    if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 })

    const payload = await reanalyzePaddleOcrJobArtifacts({ db, job })
    return NextResponse.json(payload)
  } catch (error) {
    return jsonError(error, "重新分析历史记录失败")
  }
}
