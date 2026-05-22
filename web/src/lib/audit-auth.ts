const AUTH_COOKIE = "pdf_checker_token"

export function isAuthorized(request: Request) {
  const expected = process.env.PDF_CHECKER_TOKEN || ""
  if (!expected) return true
  const url = new URL(request.url)
  const supplied = url.searchParams.get("token") || ""
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE}=`))
    ?.slice(AUTH_COOKIE.length + 1)
  return supplied === expected || cookie === expected
}
