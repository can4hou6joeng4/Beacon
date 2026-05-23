export type UserRole = "admin" | "user"
export type UserStatus = "active" | "disabled"
export type QuotaResource = "upload_bytes" | "ocr_jobs" | "ocr_pages"
export type QuotaAction = "reserve" | "consume" | "refund" | "adjust"

export type AppUser = {
  id: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  createdAt: string
  updatedAt: string
  lastLoginAt: string | null
}

export type UserQuota = {
  userId: string
  uploadBytesLimit: number
  ocrJobsLimit: number
  ocrPagesLimit: number
  period: "lifetime"
  updatedAt: string
}

export type QuotaUsage = {
  uploadBytes: number
  ocrJobs: number
  ocrPages: number
}

export type UserQuotaSnapshot = {
  quota: UserQuota
  usage: QuotaUsage
  remaining: QuotaUsage
}

export type AuthSession = {
  id: string
  userId: string
  expiresAt: string
  createdAt: string
  lastSeenAt: string
}

export type AuthContext = {
  user: AppUser
  session: AuthSession
  quota: UserQuotaSnapshot
}

export type CreateUserInput = {
  email: string
  name: string
  password: string
  role: UserRole
  quota: {
    uploadBytesLimit: number
    ocrJobsLimit: number
    ocrPagesLimit: number
  }
}

export type PublicUser = AppUser & {
  quota: UserQuotaSnapshot
}
