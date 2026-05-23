import { AppError } from "./app-error"
import { getAuthDb, normalizeEmail, normalizeUsername, publicUser, type CreateUserRecordInput, type UpdateUserInput } from "./auth-db"
import { generateSessionToken, hashPassword, hashToken, verifyPassword } from "./auth-crypto"
import type { AuthContext, CreateUserInput, PublicUser } from "./auth-types"
import { clampQuotaLimit, MAX_OCR_PAGE_QUOTA, MAX_UPLOAD_QUOTA_BYTES } from "./quota-limits"

export const AUTH_SESSION_COOKIE = "pdf_audit_session"

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MIN_PASSWORD_LENGTH = 10

export type LoginResult = {
  token: string
  maxAge: number
  user: PublicUser
}

export function cookieOptions(request: Request, maxAge?: number): {
  httpOnly: true
  sameSite: "lax"
  secure: boolean
  path: "/"
  maxAge?: number
} {
  const url = new URL(request.url)
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:" || process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  }
}

export async function getAuthContext(request: Request): Promise<AuthContext | null> {
  return getAuthContextFromCookieHeader(request.headers.get("cookie"))
}

export async function getAuthContextFromCookieHeader(cookieHeader: string | null): Promise<AuthContext | null> {
  const token = readCookie(cookieHeader, AUTH_SESSION_COOKIE)
  if (!token) return null
  const db = await getAuthDb()
  const context = await db.getContextByTokenHash(await hashToken(token))
  if (context) {
    await db.touchSession(context.session.id)
  }
  return context
}

export async function requireAuth(request: Request): Promise<AuthContext> {
  const context = await getAuthContext(request)
  if (!context) {
    throw new AppError("请先登录后再使用审计功能", { status: 401, code: "UNAUTHENTICATED" })
  }
  return context
}

export async function requireAdmin(request: Request): Promise<AuthContext> {
  const context = await requireAuth(request)
  if (context.user.role !== "admin") {
    throw new AppError("只有管理员可以执行该操作", { status: 403, code: "ADMIN_REQUIRED" })
  }
  return context
}

export async function loginWithPassword(input: {
  login: string
  password: string
  userAgent?: string | null
}): Promise<LoginResult> {
  const db = await getAuthDb()
  const user = await db.getUserByLogin(input.login)
  if (!user || user.status !== "active") {
    throw new AppError("账号或密码不正确", { status: 401, code: "INVALID_CREDENTIALS" })
  }
  const verified = await verifyPassword({
    password: input.password,
    hash: user.passwordHash,
    salt: user.passwordSalt,
    iterations: user.passwordIterations,
  })
  if (!verified) {
    throw new AppError("账号或密码不正确", { status: 401, code: "INVALID_CREDENTIALS" })
  }

  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  await db.createSession({
    userId: user.id,
    tokenHash: await hashToken(token),
    expiresAt,
    userAgent: input.userAgent,
  })
  await db.setLastLogin(user.id)
  const refreshed = await db.getUserById(user.id)
  if (!refreshed) {
    throw new AppError("账号不存在", { status: 404, code: "USER_NOT_FOUND" })
  }
  return {
    token,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    user: publicUser(refreshed, await db.getQuotaSnapshot(user.id)),
  }
}

export async function logout(request: Request): Promise<void> {
  const token = readCookie(request.headers.get("cookie"), AUTH_SESSION_COOKIE)
  if (!token) return
  const db = await getAuthDb()
  await db.deleteSessionByTokenHash(await hashToken(token))
}

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
  validateCreateUserInput(input)
  const db = await getAuthDb()
  const password = await hashPassword(input.password)
  const record: CreateUserRecordInput = {
    username: normalizeUsername(input.username),
    email: normalizeOptionalEmail(input.email),
    name: input.name.trim(),
    role: input.role,
    quota: normalizeQuota(input.quota),
    passwordHash: password.hash,
    passwordSalt: password.salt,
    passwordIterations: password.iterations,
  }
  try {
    return await db.createUser(record)
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError("该账号已经存在", { status: 409, code: "USER_EXISTS" })
    }
    throw error
  }
}

export async function bootstrapAdmin(input: {
  username: string
  email?: string
  name: string
  password: string
  quota: CreateUserInput["quota"]
}): Promise<PublicUser> {
  const db = await getAuthDb()
  const count = await db.countUsers()
  if (count > 0) {
    throw new AppError("管理员账号已经初始化", { status: 409, code: "BOOTSTRAP_CLOSED" })
  }
  return createUser({ ...input, role: "admin" })
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<PublicUser> {
  const db = await getAuthDb()
  const updated = await db.updateUser(id, {
    name: input.name?.trim(),
    role: input.role,
    status: input.status,
    quota: input.quota ? normalizeQuota(input.quota) : undefined,
  })
  if (!updated) {
    throw new AppError("用户不存在", { status: 404, code: "USER_NOT_FOUND" })
  }
  return updated
}

export function verifyBootstrapRequest(request: Request, bodyToken?: string): void {
  const expected = process.env.AUTH_BOOTSTRAP_TOKEN || ""
  if (!expected) {
    throw new AppError("未配置 AUTH_BOOTSTRAP_TOKEN", { status: 503, code: "BOOTSTRAP_TOKEN_MISSING" })
  }
  const header = request.headers.get("authorization") || ""
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : ""
  if (bearer !== expected && bodyToken !== expected) {
    throw new AppError("初始化令牌无效", { status: 401, code: "BOOTSTRAP_UNAUTHORIZED" })
  }
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...valueParts] = part.trim().split("=")
    if (rawName === name) {
      return decodeURIComponent(valueParts.join("="))
    }
  }
  return null
}

function validateCreateUserInput(input: CreateUserInput): void {
  validateUsername(input.username)
  normalizeOptionalEmail(input.email)
  if (!input.name.trim()) {
    throw new AppError("请输入用户名称", { status: 400, code: "INVALID_NAME" })
  }
  if (input.role !== "admin" && input.role !== "user") {
    throw new AppError("用户角色无效", { status: 400, code: "INVALID_ROLE" })
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(`密码至少需要 ${MIN_PASSWORD_LENGTH} 位`, { status: 400, code: "WEAK_PASSWORD" })
  }
  normalizeQuota(input.quota)
}

function validateUsername(username: string): void {
  const normalized = normalizeUsername(username)
  if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(normalized)) {
    throw new AppError("账号需为 3-32 位字母、数字、下划线或连字符，并以字母或数字开头", {
      status: 400,
      code: "INVALID_USERNAME",
    })
  }
}

function normalizeOptionalEmail(email: string | undefined): string {
  if (!email?.trim()) return ""
  const normalized = normalizeEmail(email)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw new AppError("请输入有效邮箱", { status: 400, code: "INVALID_EMAIL" })
  }
  return normalized
}

function normalizeQuota(quota: CreateUserInput["quota"]): CreateUserInput["quota"] {
  const uploadBytesLimit = positiveInteger(quota.uploadBytesLimit, "上传额度")
  const ocrJobsLimit = positiveInteger(quota.ocrJobsLimit, "OCR 任务额度")
  const ocrPagesLimit = positiveInteger(quota.ocrPagesLimit, "OCR 页数额度")
  if (uploadBytesLimit > MAX_UPLOAD_QUOTA_BYTES) {
    throw new AppError("上传额度不能超过 Cloudflare R2 免费层 10GB", { status: 400, code: "UPLOAD_QUOTA_LIMIT_EXCEEDED" })
  }
  if (ocrPagesLimit > MAX_OCR_PAGE_QUOTA) {
    throw new AppError("OCR 页数额度不能超过 PaddleOCR 每日 2000 页上限", { status: 400, code: "OCR_PAGE_LIMIT_EXCEEDED" })
  }
  return {
    uploadBytesLimit: clampQuotaLimit("uploadBytesLimit", uploadBytesLimit),
    ocrJobsLimit,
    ocrPagesLimit: clampQuotaLimit("ocrPagesLimit", ocrPagesLimit),
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new AppError(`${label}必须是非负整数`, { status: 400, code: "INVALID_QUOTA" })
  }
  return value
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique|constraint/i.test(error.message)
}
