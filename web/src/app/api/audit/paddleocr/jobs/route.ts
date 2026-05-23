import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAuth } from "@/lib/auth"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    await requireAuth(request)
    return NextResponse.json(
      { error: "请通过对象存储上传流程提交 OCR，直连 fileUrl 已关闭以保证任务归属和额度审计" },
      { status: 410 },
    )
  } catch (error) {
    return jsonError(error, "提交 PaddleOCR 任务失败")
  }
}
