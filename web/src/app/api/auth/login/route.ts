import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { AUTH_SESSION_COOKIE, cookieOptions, loginWithPassword } from "@/lib/auth"

export const runtime = "nodejs"

type LoginPayload = {
  username?: string
  account?: string
  email?: string
  password?: string
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as LoginPayload | null
    const result = await loginWithPassword({
      login: payload?.username || payload?.account || payload?.email || "",
      password: payload?.password || "",
      userAgent: request.headers.get("user-agent"),
    })
    const response = NextResponse.json({ user: result.user })
    response.cookies.set(AUTH_SESSION_COOKIE, result.token, cookieOptions(request, result.maxAge))
    return response
  } catch (error) {
    return jsonError(error, "登录失败")
  }
}
