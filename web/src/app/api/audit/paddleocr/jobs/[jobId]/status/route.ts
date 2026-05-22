import { NextResponse } from "next/server"
import { isAuthorized } from "@/lib/audit-auth"
import { fetchPaddleOcrJobSnapshot } from "@/lib/paddleocr"

export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "未授权，请使用带 token 的链接访问" }, { status: 401 })
    }

    const { jobId } = await params
    const snapshot = await fetchPaddleOcrJobSnapshot({ providerJobId: jobId })
    return NextResponse.json({ snapshot })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "读取 PaddleOCR 状态失败" }, { status: 500 })
  }
}
