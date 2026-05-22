import { NextResponse } from "next/server"
import { isAuthorized } from "@/lib/audit-auth"

export const runtime = "nodejs"

function localUploadsEnabled(): boolean {
  return (process.env.AUDIT_RUNTIME_MODE ?? "local-python") === "local-python"
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "未授权，请使用带 token 的链接访问" }, { status: 401 })
    }
    if (!localUploadsEnabled()) {
      return NextResponse.json({ error: "云端运行模式请使用对象存储上传地址" }, { status: 409 })
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

    const { writeUploadChunk } = await import("@/lib/upload-store")
    writeUploadChunk(id, index, content)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "上传分片失败" }, { status: 500 })
  }
}
