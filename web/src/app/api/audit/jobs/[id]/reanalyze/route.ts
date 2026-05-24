import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { reanalyzePaddleOcrJobArtifacts } from "@/lib/audit-reanalysis"
import { requireAuth } from "@/lib/auth"
import { getAuditDb } from "@/lib/audit-db"
import { requireAuditJobForUser } from "@/lib/audit-isolation"

export const runtime = "nodejs"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireAuth(request)
    const { id } = await params
    const db = await getAuditDb()
    const job = await requireAuditJobForUser({ db, jobId: id, userId: context.user.id, role: context.user.role })

    const payload = await reanalyzePaddleOcrJobArtifacts({ db, job })
    return NextResponse.json(payload)
  } catch (error) {
    return jsonError(error, "重新分析历史记录失败")
  }
}
