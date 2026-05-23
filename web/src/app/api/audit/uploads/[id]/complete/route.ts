import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAuth } from "@/lib/auth"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    await requireAuth(request)
    return NextResponse.json({ error: "本机分片上传已停用，请使用 /api/audit/cloud-uploads/paddleocr" }, { status: 410 })
  } catch (error) {
    return jsonError(error, "创建任务失败")
  }
}
