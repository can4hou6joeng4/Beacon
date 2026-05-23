import { getCloudflareD1Binding } from "./cloudflare-env"
import type {
  AppUser,
  AuthContext,
  AuthSession,
  CreateUserInput,
  PublicUser,
  QuotaAction,
  QuotaResource,
  UserQuota,
  UserQuotaSnapshot,
  UserRole,
  UserStatus,
} from "./auth-types"

export type UserCredentials = AppUser & {
  passwordHash: string
  passwordSalt: string
  passwordIterations: number
}

export type CreateUserRecordInput = Omit<CreateUserInput, "password"> & {
  passwordHash: string
  passwordSalt: string
  passwordIterations: number
  status?: UserStatus
}

export type UpdateUserInput = {
  name?: string
  role?: UserRole
  status?: UserStatus
  quota?: CreateUserInput["quota"]
}

export type QuotaLedgerInput = {
  userId: string
  jobId?: string | null
  resource: QuotaResource
  action: QuotaAction
  amount: number
  reason: string
}

export type AuthDb = {
  countUsers(): Promise<number>
  createUser(input: CreateUserRecordInput): Promise<PublicUser>
  getUserByEmail(email: string): Promise<UserCredentials | null>
  getUserById(id: string): Promise<AppUser | null>
  listUsers(): Promise<PublicUser[]>
  updateUser(id: string, input: UpdateUserInput): Promise<PublicUser | null>
  createSession(input: { userId: string; tokenHash: string; expiresAt: string; userAgent?: string | null }): Promise<AuthSession>
  getContextByTokenHash(tokenHash: string): Promise<AuthContext | null>
  deleteSessionByTokenHash(tokenHash: string): Promise<void>
  touchSession(id: string): Promise<void>
  setLastLogin(userId: string): Promise<void>
  getQuotaSnapshot(userId: string): Promise<UserQuotaSnapshot>
  addQuotaLedger(input: QuotaLedgerInput): Promise<void>
  getJobLedgerAmount(input: { userId: string; jobId: string; resource: QuotaResource; action?: QuotaAction }): Promise<number>
}

export async function getAuthDb(): Promise<AuthDb> {
  const d1 = await getCloudflareD1Binding()
  if (d1) {
    const { createAuthD1Db } = await import("./auth-db-d1")
    return createAuthD1Db(d1)
  }

  const { getSqliteAuthDb } = await import("./auth-db-sqlite")
  return getSqliteAuthDb()
}

export async function createAuthDbForPath(dbPath: string): Promise<AuthDb> {
  const { createAuthDbForPath: createSqliteAuthDbForPath } = await import("./auth-db-sqlite")
  return createSqliteAuthDbForPath(dbPath)
}

export function publicUser(user: AppUser, quota: UserQuotaSnapshot): PublicUser {
  return { ...user, quota }
}

export function emptyQuotaSnapshot(userId: string, now = new Date().toISOString()): UserQuotaSnapshot {
  const quota: UserQuota = {
    userId,
    uploadBytesLimit: 0,
    ocrJobsLimit: 0,
    ocrPagesLimit: 0,
    period: "lifetime",
    updatedAt: now,
  }
  return {
    quota,
    usage: { uploadBytes: 0, ocrJobs: 0, ocrPages: 0 },
    remaining: { uploadBytes: 0, ocrJobs: 0, ocrPages: 0 },
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function assertRole(value: string): UserRole {
  if (value === "admin" || value === "user") return value
  throw new Error(`Invalid user role: ${value}`)
}

export function assertStatus(value: string): UserStatus {
  if (value === "active" || value === "disabled") return value
  throw new Error(`Invalid user status: ${value}`)
}

export function assertPeriod(value: string): "lifetime" {
  if (value === "lifetime") return value
  throw new Error(`Invalid quota period: ${value}`)
}
