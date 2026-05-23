import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { createUser, requireAdmin } from "@/lib/auth"
import { getAuthDb } from "@/lib/auth-db"
import type { CreateUserInput } from "@/lib/auth-types"
import { DEFAULT_OCR_JOB_QUOTA, DEFAULT_OCR_PAGE_QUOTA, DEFAULT_UPLOAD_QUOTA_BYTES } from "@/lib/quota-limits"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    const db = await getAuthDb()
    const users = await db.listUsers()
    return NextResponse.json({ users })
  } catch (error) {
    return jsonError(error, "读取用户列表失败")
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request)
    const payload = (await request.json().catch(() => null)) as Partial<CreateUserInput> | null
    const user = await createUser({
      username: payload?.username || payload?.email || "",
      email: payload?.email,
      name: payload?.name || "",
      password: payload?.password || "",
      role: payload?.role || "user",
      quota: {
        uploadBytesLimit: payload?.quota?.uploadBytesLimit ?? DEFAULT_UPLOAD_QUOTA_BYTES,
        ocrJobsLimit: payload?.quota?.ocrJobsLimit ?? DEFAULT_OCR_JOB_QUOTA,
        ocrPagesLimit: payload?.quota?.ocrPagesLimit ?? DEFAULT_OCR_PAGE_QUOTA,
      },
    })
    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    return jsonError(error, "创建用户失败")
  }
}
