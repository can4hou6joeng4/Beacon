import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAuth } from "@/lib/auth"

export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    await requireAuth(request)
    await params
    return NextResponse.json(
      { error: "请通过任务状态接口查询 OCR 状态，直连 provider job 查询已关闭以保证任务归属审计" },
      { status: 410 },
    )
  } catch (error) {
    return jsonError(error, "读取 PaddleOCR 状态失败")
  }
}
