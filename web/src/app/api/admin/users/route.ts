import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { createUser, requireAdmin } from "@/lib/auth"
import { getAuthDb } from "@/lib/auth-db"
import type { CreateUserInput } from "@/lib/auth-types"

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
      email: payload?.email || "",
      name: payload?.name || "",
      password: payload?.password || "",
      role: payload?.role || "user",
      quota: {
        uploadBytesLimit: payload?.quota?.uploadBytesLimit ?? 0,
        ocrJobsLimit: payload?.quota?.ocrJobsLimit ?? 0,
        ocrPagesLimit: payload?.quota?.ocrPagesLimit ?? 0,
      },
    })
    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    return jsonError(error, "创建用户失败")
  }
}
