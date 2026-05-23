import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { AUTH_SESSION_COOKIE, cookieOptions, logout } from "@/lib/auth"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    await logout(request)
    const response = NextResponse.json({ ok: true })
    response.cookies.set(AUTH_SESSION_COOKIE, "", cookieOptions(request, 0))
    return response
  } catch (error) {
    return jsonError(error, "退出登录失败")
  }
}
