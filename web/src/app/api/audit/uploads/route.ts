import { NextResponse } from "next/server"
import { isAuthorized } from "@/lib/audit-auth"

export const runtime = "nodejs"

function localUploadsEnabled(): boolean {
  return (process.env.AUDIT_RUNTIME_MODE ?? "local-python") === "local-python"
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "未授权，请使用带 token 的链接访问" }, { status: 401 })
    }
    if (!localUploadsEnabled()) {
      return NextResponse.json({ error: "云端运行模式请使用 /api/audit/cloud-uploads" }, { status: 409 })
    }

    const payload = (await request.json().catch(() => null)) as { filename?: string; size?: number; contentType?: string } | null
    if (!payload?.filename || !payload.size || payload.size < 1) {
      return NextResponse.json({ error: "缺少上传文件信息" }, { status: 400 })
    }
    if (!payload.filename.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "请上传 PDF 文件" }, { status: 400 })
    }
    if (payload.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF 文件超过当前 100MB 上传限制" }, { status: 413 })
    }

    const { createUpload } = await import("@/lib/upload-store")
    return NextResponse.json(createUpload({
      filename: payload.filename,
      size: payload.size,
      contentType: payload.contentType || "application/pdf",
    }))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建上传会话失败" }, { status: 500 })
  }
}
