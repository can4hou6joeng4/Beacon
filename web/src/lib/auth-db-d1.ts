import { randomUUID } from "node:crypto"
import {
  assertPeriod,
  assertRole,
  assertStatus,
  emptyQuotaSnapshot,
  normalizeEmail,
  normalizeUsername,
  publicUser,
  type AuthDb,
  type CreateUserRecordInput,
  type QuotaLedgerInput,
  type UpdateUserInput,
  type UserCredentials,
} from "./auth-db"
import type { AppUser, AuthSession, QuotaAction, QuotaResource, UserQuota, UserQuotaSnapshot } from "./auth-types"
import type { D1DatabaseLike } from "./cloudflare-env"
import { currentUtcDayQuotaWindow } from "./quota-period"

type UserRow = {
  id: string
  username: string | null
  email: string
  name: string
  role: string
  password_hash: string
  password_salt: string
  password_iterations: number
  status: string
  created_at: string
  updated_at: string
  last_login_at: string | null
}

type QuotaRow = {
  user_id: string
  upload_bytes_limit: number
  ocr_jobs_limit: number
  ocr_pages_limit: number
  period: string
  updated_at: string
}

type UsageRow = {
  upload_bytes: number | null
  ocr_jobs: number | null
  ocr_pages: number | null
}

type CountRow = {
  count: number
}

export function createAuthD1Db(db: unknown): AuthDb {
  const d1 = db as D1DatabaseLike

  return {
    async countUsers() {
      const row = await d1.prepare("SELECT COUNT(*) AS count FROM users").first<CountRow>()
      return Number(row?.count ?? 0)
    },

    async createUser(input: CreateUserRecordInput) {
      const now = new Date().toISOString()
      const id = randomUUID()
      const username = normalizeUsername(input.username)
      const email = input.email ? normalizeEmail(input.email) : legacyEmailForUsername(username)
      const quota: UserQuota = {
        userId: id,
        uploadBytesLimit: input.quota.uploadBytesLimit,
        ocrJobsLimit: input.quota.ocrJobsLimit,
        ocrPagesLimit: input.quota.ocrPagesLimit,
        period: "lifetime",
        updatedAt: now,
      }
      const insertUser = d1.prepare(`
        INSERT INTO users (
          id, username, email, name, role, password_hash, password_salt, password_iterations, status, created_at, updated_at, last_login_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).bind(
        id,
        username,
        email,
        input.name.trim(),
        input.role,
        input.passwordHash,
        input.passwordSalt,
        input.passwordIterations,
        input.status ?? "active",
        now,
        now,
      )
      const insertQuota = d1.prepare(`
        INSERT INTO user_quotas (user_id, upload_bytes_limit, ocr_jobs_limit, ocr_pages_limit, period, updated_at)
        VALUES (?, ?, ?, ?, 'lifetime', ?)
      `).bind(id, quota.uploadBytesLimit, quota.ocrJobsLimit, quota.ocrPagesLimit, now)
      if (d1.batch) {
        await d1.batch([insertUser, insertQuota])
      } else {
        await insertUser.run()
        await insertQuota.run()
      }
      return publicUser(mapUser(await requireUserRow(d1, id)), { quota, usage: zeroUsage(), remaining: quotaToUsage(quota) })
    },

    async getUserByLogin(login: string) {
      const normalized = normalizeUsername(login)
      const row = await d1.prepare("SELECT * FROM users WHERE username = ? OR email = ?")
        .bind(normalized, normalizeEmail(login))
        .first<UserRow>()
      return row ? mapCredentials(row) : null
    },

    async getUserById(id: string) {
      const row = await d1.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>()
      return row ? mapUser(row) : null
    },

    async listUsers() {
      const rows = await d1.prepare("SELECT * FROM users ORDER BY created_at DESC, id DESC").all<UserRow>()
      return Promise.all((rows.results ?? []).map(async (row) => publicUser(mapUser(row), await this.getQuotaSnapshot(row.id))))
    },

    async updateUser(id: string, input: UpdateUserInput) {
      const existing = await this.getUserById(id)
      if (!existing) return null
      const now = new Date().toISOString()
      await d1.prepare("UPDATE users SET name = ?, role = ?, status = ?, updated_at = ? WHERE id = ?")
        .bind(input.name?.trim() || existing.name, input.role ?? existing.role, input.status ?? existing.status, now, id)
        .run()
      if (input.quota) {
        await d1.prepare(`
          UPDATE user_quotas
          SET upload_bytes_limit = ?, ocr_jobs_limit = ?, ocr_pages_limit = ?, updated_at = ?
          WHERE user_id = ?
        `).bind(input.quota.uploadBytesLimit, input.quota.ocrJobsLimit, input.quota.ocrPagesLimit, now, id).run()
        await this.addQuotaLedger({ userId: id, resource: "upload_bytes", action: "adjust", amount: 0, reason: "admin_quota_update" })
      }
      const user = await this.getUserById(id)
      return user ? publicUser(user, await this.getQuotaSnapshot(id)) : null
    },

    async createSession(input: { userId: string; tokenHash: string; expiresAt: string; userAgent?: string | null }) {
      const now = new Date().toISOString()
      const id = randomUUID()
      await d1.prepare(`
        INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(id, input.userId, input.tokenHash, input.expiresAt, now, now, input.userAgent ?? null).run()
      return { id, userId: input.userId, expiresAt: input.expiresAt, createdAt: now, lastSeenAt: now }
    },

    async getContextByTokenHash(tokenHash: string) {
      const now = new Date().toISOString()
      const row = await d1.prepare(`
        SELECT
          users.*,
          sessions.id AS session_id,
          sessions.user_id AS session_user_id,
          sessions.expires_at AS session_expires_at,
          sessions.created_at AS session_created_at,
          sessions.last_seen_at AS session_last_seen_at
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.status = 'active'
      `).bind(tokenHash, now).first<UserRow & {
        session_id: string
        session_user_id: string
        session_expires_at: string
        session_created_at: string
        session_last_seen_at: string
      }>()
      if (!row) return null
      const user = mapUser(row)
      const session: AuthSession = {
        id: row.session_id,
        userId: row.session_user_id,
        expiresAt: row.session_expires_at,
        createdAt: row.session_created_at,
        lastSeenAt: row.session_last_seen_at,
      }
      return { user, session, quota: await this.getQuotaSnapshot(user.id) }
    },

    async deleteSessionByTokenHash(tokenHash: string) {
      await d1.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run()
    },

    async touchSession(id: string) {
      await d1.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run()
    },

    async setLastLogin(userId: string) {
      const now = new Date().toISOString()
      await d1.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(now, now, userId).run()
    },

    async getQuotaSnapshot(userId: string) {
      const quotaRow = await d1.prepare("SELECT * FROM user_quotas WHERE user_id = ?").bind(userId).first<QuotaRow>()
      if (!quotaRow) return emptyQuotaSnapshot(userId)
      const usageWindow = currentUtcDayQuotaWindow()
      const usageRow = await d1.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN resource = 'upload_bytes' THEN signed_amount ELSE 0 END), 0) AS upload_bytes,
          COALESCE(SUM(CASE WHEN resource = 'ocr_jobs' THEN signed_amount ELSE 0 END), 0) AS ocr_jobs,
          COALESCE(SUM(CASE WHEN resource = 'ocr_pages' THEN signed_amount ELSE 0 END), 0) AS ocr_pages
        FROM (
          SELECT resource,
            CASE
              WHEN action = 'refund' THEN -amount
              WHEN action = 'adjust' THEN 0
              ELSE amount
            END AS signed_amount
          FROM quota_ledger
          WHERE user_id = ? AND created_at >= ? AND created_at < ?
        )
      `).bind(userId, usageWindow.startIso, usageWindow.endIso).first<UsageRow>()
      const quota = mapQuota(quotaRow)
      const usage = {
        uploadBytes: Number(usageRow?.upload_bytes ?? 0),
        ocrJobs: Number(usageRow?.ocr_jobs ?? 0),
        ocrPages: Number(usageRow?.ocr_pages ?? 0),
      }
      return {
        quota,
        usage,
        remaining: {
          uploadBytes: Math.max(0, quota.uploadBytesLimit - usage.uploadBytes),
          ocrJobs: Math.max(0, quota.ocrJobsLimit - usage.ocrJobs),
          ocrPages: Math.max(0, quota.ocrPagesLimit - usage.ocrPages),
        },
      }
    },

    async addQuotaLedger(input: QuotaLedgerInput) {
      await d1.prepare(`
        INSERT INTO quota_ledger (id, user_id, job_id, resource, action, amount, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        randomUUID(),
        input.userId,
        input.jobId ?? null,
        input.resource,
        input.action,
        input.amount,
        input.reason,
        new Date().toISOString(),
      ).run()
    },

    async getJobLedgerAmount(input: { userId: string; jobId: string; resource: QuotaResource; action?: QuotaAction }) {
      const row = input.action
        ? await d1.prepare(`
          SELECT COALESCE(SUM(amount), 0) AS count FROM quota_ledger WHERE user_id = ? AND job_id = ? AND resource = ? AND action = ?
        `).bind(input.userId, input.jobId, input.resource, input.action).first<CountRow>()
        : await d1.prepare(`
          SELECT COALESCE(SUM(amount), 0) AS count FROM quota_ledger WHERE user_id = ? AND job_id = ? AND resource = ?
        `).bind(input.userId, input.jobId, input.resource).first<CountRow>()
      return Number(row?.count ?? 0)
    },
  }
}

async function requireUserRow(d1: D1DatabaseLike, id: string): Promise<UserRow> {
  const row = await d1.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>()
  if (!row) throw new Error(`User was not created: ${id}`)
  return row
}

function mapUser(row: UserRow): AppUser {
  return {
    id: row.id,
    username: row.username || fallbackUsername(row.email),
    email: row.email,
    name: row.name,
    role: assertRole(row.role),
    status: assertStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  }
}

function legacyEmailForUsername(username: string): string {
  return `${username}@local.invalid`
}

function fallbackUsername(email: string): string {
  const localPart = email.split("@")[0]?.trim().toLowerCase()
  return localPart || email.trim().toLowerCase()
}

function mapCredentials(row: UserRow): UserCredentials {
  return {
    ...mapUser(row),
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    passwordIterations: row.password_iterations,
  }
}

function mapQuota(row: QuotaRow): UserQuota {
  return {
    userId: row.user_id,
    uploadBytesLimit: row.upload_bytes_limit,
    ocrJobsLimit: row.ocr_jobs_limit,
    ocrPagesLimit: row.ocr_pages_limit,
    period: assertPeriod(row.period),
    updatedAt: row.updated_at,
  }
}

function zeroUsage(): UserQuotaSnapshot["usage"] {
  return { uploadBytes: 0, ocrJobs: 0, ocrPages: 0 }
}

function quotaToUsage(quota: UserQuota): UserQuotaSnapshot["usage"] {
  return {
    uploadBytes: quota.uploadBytesLimit,
    ocrJobs: quota.ocrJobsLimit,
    ocrPages: quota.ocrPagesLimit,
  }
}
