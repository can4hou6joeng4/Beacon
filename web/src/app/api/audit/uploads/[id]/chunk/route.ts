import { NextResponse } from "next/server"
import { isAuthorized } from "@/lib/audit-auth"
import { writeUploadChunk } from "@/lib/upload-store"

export const runtime = "nodejs"

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "未授权，请使用带 token 的链接访问" }, { status: 401 })
    }

    const { id } = await params
    const index = Number(new URL(request.url).searchParams.get("index"))
    if (!Number.isInteger(index) || index < 0) {
      return NextResponse.json({ error: "无效的分片序号" }, { status: 400 })
    }

    const content = Buffer.from(await request.arrayBuffer())
    if (content.length < 1) {
      return NextResponse.json({ error: "分片内容为空" }, { status: 400 })
    }
    if (content.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "单个上传分片超过限制" }, { status: 413 })
    }

    writeUploadChunk(id, index, content)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "上传分片失败" }, { status: 500 })
  }
}
