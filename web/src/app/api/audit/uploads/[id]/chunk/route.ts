import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAuth } from "@/lib/auth"

export const runtime = "nodejs"

export async function PUT(request: Request) {
  try {
    await requireAuth(request)
    return NextResponse.json({ error: "本机分片上传已停用，请使用对象存储上传地址" }, { status: 410 })
  } catch (error) {
    return jsonError(error, "上传分片失败")
  }
}
