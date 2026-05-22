import { NextResponse } from "next/server"
import { isAuthorized } from "@/lib/audit-auth"
import { submitPaddleOcrUrlJob } from "@/lib/paddleocr"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "未授权，请使用带 token 的链接访问" }, { status: 401 })
    }

    const payload = (await request.json().catch(() => null)) as { fileUrl?: string } | null
    if (!payload?.fileUrl) {
      return NextResponse.json({ error: "缺少 PaddleOCR fileUrl" }, { status: 400 })
    }

    const submitted = await submitPaddleOcrUrlJob({ fileUrl: payload.fileUrl })
    return NextResponse.json(submitted)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "提交 PaddleOCR 任务失败" }, { status: 500 })
  }
}
