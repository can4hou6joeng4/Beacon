import { NextRequest, NextResponse } from "next/server"

const AUTH_COOKIE = "pdf_checker_token"

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/file.svg" ||
    pathname === "/globe.svg" ||
    pathname === "/next.svg" ||
    pathname === "/vercel.svg" ||
    pathname === "/window.svg"
  )
}

export function middleware(request: NextRequest) {
  const expected = process.env.PDF_CHECKER_TOKEN || ""
  if (!expected || isPublicAsset(request.nextUrl.pathname)) {
    return NextResponse.next()
  }

  const supplied = request.nextUrl.searchParams.get("token") || ""
  const cookieToken = request.cookies.get(AUTH_COOKIE)?.value || ""
  const authorized = supplied === expected || cookieToken === expected

  if (!authorized) {
    return NextResponse.json({ error: "未授权，请使用带 token 的链接访问" }, { status: 401 })
  }

  const response = NextResponse.next()
  if (supplied === expected) {
    response.cookies.set(AUTH_COOKIE, expected, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
    })
  }
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|api/audit/jobs$).*)"],
}
