import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAuth } from "@/lib/auth"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const context = await requireAuth(request)
    return NextResponse.json({
      user: {
        ...context.user,
        quota: context.quota,
      },
    })
  } catch (error) {
    return jsonError(error, "读取当前用户失败")
  }
}
