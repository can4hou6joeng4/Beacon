import Database from "better-sqlite3"
import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
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
import type { AppUser, AuthContext, AuthSession, QuotaAction, QuotaResource, UserQuota } from "./auth-types"
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

let singleton: AuthDb | null = null

export function getSqliteAuthDb(): AuthDb {
  if (!singleton) {
    const dbPath = process.env.AUDIT_DB_PATH ?? join(process.cwd(), "data", "audit.sqlite")
    singleton = createAuthDbForPath(dbPath)
  }
  return singleton
}

export function createAuthDbForPath(dbPath: string): AuthDb {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  migrate(db)

  return {
    async countUsers() {
      const row = db.prepare("SELECT COUNT(*) AS count FROM users").get() as CountRow
      return Number(row.count ?? 0)
    },

    async createUser(input: CreateUserRecordInput) {
      const now = new Date().toISOString()
      const id = randomUUID()
      const username = normalizeUsername(input.username)
      const email = input.email ? normalizeEmail(input.email) : legacyEmailForUsername(username)
      const create = db.transaction(() => {
        db.prepare(`
          INSERT INTO users (
            id, username, email, name, role, password_hash, password_salt, password_iterations, status, created_at, updated_at, last_login_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `).run(
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
        db.prepare(`
          INSERT INTO user_quotas (user_id, upload_bytes_limit, ocr_jobs_limit, ocr_pages_limit, period, updated_at)
          VALUES (?, ?, ?, ?, 'lifetime', ?)
        `).run(id, input.quota.uploadBytesLimit, input.quota.ocrJobsLimit, input.quota.ocrPagesLimit, now)
      })
      create()
      const user = mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow)
      return publicUser(user, await this.getQuotaSnapshot(id))
    },

    async getUserByLogin(login: string) {
      const normalized = normalizeUsername(login)
      const row = db.prepare("SELECT * FROM users WHERE username = ? OR email = ?").get(normalized, normalizeEmail(login)) as UserRow | undefined
      return row ? mapCredentials(row) : null
    },

    async getUserById(id: string) {
      const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined
      return row ? mapUser(row) : null
    },

    async listUsers() {
      const rows = db.prepare("SELECT * FROM users ORDER BY created_at DESC, rowid DESC").all() as UserRow[]
      return Promise.all(rows.map(async (row) => publicUser(mapUser(row), await this.getQuotaSnapshot(row.id))))
    },

    async updateUser(id: string, input: UpdateUserInput) {
      const existing = await this.getUserById(id)
      if (!existing) return null
      const now = new Date().toISOString()
      const update = db.transaction(() => {
        db.prepare("UPDATE users SET name = ?, role = ?, status = ?, updated_at = ? WHERE id = ?")
          .run(input.name?.trim() || existing.name, input.role ?? existing.role, input.status ?? existing.status, now, id)
        if (input.quota) {
          db.prepare(`
            UPDATE user_quotas
            SET upload_bytes_limit = ?, ocr_jobs_limit = ?, ocr_pages_limit = ?, updated_at = ?
            WHERE user_id = ?
          `).run(input.quota.uploadBytesLimit, input.quota.ocrJobsLimit, input.quota.ocrPagesLimit, now, id)
          db.prepare(`
            INSERT INTO quota_ledger (id, user_id, job_id, resource, action, amount, reason, created_at)
            VALUES (?, ?, NULL, 'upload_bytes', 'adjust', 0, 'admin_quota_update', ?)
          `).run(randomUUID(), id, now)
        }
      })
      update()
      const user = await this.getUserById(id)
      return user ? publicUser(user, await this.getQuotaSnapshot(id)) : null
    },

    async createSession(input: { userId: string; tokenHash: string; expiresAt: string; userAgent?: string | null }) {
      const now = new Date().toISOString()
      const id = randomUUID()
      db.prepare(`
        INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, input.userId, input.tokenHash, input.expiresAt, now, now, input.userAgent ?? null)
      return { id, userId: input.userId, expiresAt: input.expiresAt, createdAt: now, lastSeenAt: now }
    },

    async getContextByTokenHash(tokenHash: string) {
      const now = new Date().toISOString()
      const row = db.prepare(`
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
      `).get(tokenHash, now) as (UserRow & {
        session_id: string
        session_user_id: string
        session_expires_at: string
        session_created_at: string
        session_last_seen_at: string
      }) | undefined
      if (!row) return null
      const user = mapUser(row)
      const session: AuthSession = {
        id: row.session_id,
        userId: row.session_user_id,
        expiresAt: row.session_expires_at,
        createdAt: row.session_created_at,
        lastSeenAt: row.session_last_seen_at,
      }
      const context: AuthContext = { user, session, quota: await this.getQuotaSnapshot(user.id) }
      return context
    },

    async deleteSessionByTokenHash(tokenHash: string) {
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash)
    },

    async touchSession(id: string) {
      db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(new Date().toISOString(), id)
    },

    async setLastLogin(userId: string) {
      const now = new Date().toISOString()
      db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(now, now, userId)
    },

    async getQuotaSnapshot(userId: string) {
      const quotaRow = db.prepare("SELECT * FROM user_quotas WHERE user_id = ?").get(userId) as QuotaRow | undefined
      if (!quotaRow) return emptyQuotaSnapshot(userId)
      const usageWindow = currentUtcDayQuotaWindow()
      const usageRow = db.prepare(`
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
      `).get(userId, usageWindow.startIso, usageWindow.endIso) as UsageRow | undefined
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
      db.prepare(`
        INSERT INTO quota_ledger (id, user_id, job_id, resource, action, amount, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        input.userId,
        input.jobId ?? null,
        input.resource,
        input.action,
        input.amount,
        input.reason,
        new Date().toISOString(),
      )
    },

    async getJobLedgerAmount(input: { userId: string; jobId: string; resource: QuotaResource; action?: QuotaAction }) {
      const row = input.action
        ? db.prepare("SELECT COALESCE(SUM(amount), 0) AS count FROM quota_ledger WHERE user_id = ? AND job_id = ? AND resource = ? AND action = ?")
          .get(input.userId, input.jobId, input.resource, input.action) as CountRow | undefined
        : db.prepare("SELECT COALESCE(SUM(amount), 0) AS count FROM quota_ledger WHERE user_id = ? AND job_id = ? AND resource = ?")
          .get(input.userId, input.jobId, input.resource) as CountRow | undefined
      return Number(row?.count ?? 0)
    },
  }
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      python_job_id TEXT UNIQUE,
      provider_job_id TEXT,
      object_key TEXT,
      runtime TEXT NOT NULL DEFAULT 'paddleocr',
      filename TEXT NOT NULL,
      cutoff TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      pages_ocr INTEGER NOT NULL DEFAULT 0,
      ocr_error_pages INTEGER NOT NULL DEFAULT 0,
      ocr_total_pages INTEGER NOT NULL DEFAULT 0,
      certificate_pages INTEGER NOT NULL DEFAULT 0,
      validity_candidates INTEGER NOT NULL DEFAULT 0,
      matches INTEGER NOT NULL DEFAULT 0,
      near_expiry INTEGER NOT NULL DEFAULT 0,
      needs_review INTEGER NOT NULL DEFAULT 0,
      upload_bytes INTEGER NOT NULL DEFAULT 0,
      ocr_pages_used INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_python_job_id ON jobs(python_job_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_provider_job_id ON jobs(provider_job_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_iterations INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_quotas (
      user_id TEXT PRIMARY KEY,
      upload_bytes_limit INTEGER NOT NULL DEFAULT 0,
      ocr_jobs_limit INTEGER NOT NULL DEFAULT 0,
      ocr_pages_limit INTEGER NOT NULL DEFAULT 0,
      period TEXT NOT NULL DEFAULT 'lifetime',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quota_ledger (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      job_id TEXT,
      resource TEXT NOT NULL CHECK (resource IN ('upload_bytes', 'ocr_jobs', 'ocr_pages')),
      action TEXT NOT NULL CHECK (action IN ('reserve', 'consume', 'refund', 'adjust')),
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_quota_ledger_user_resource ON quota_ledger(user_id, resource);
    CREATE INDEX IF NOT EXISTS idx_quota_ledger_job_id ON quota_ledger(job_id);
  `)

  if (tableExists(db, "jobs")) {
    addColumnIfMissing(db, "jobs", "user_id", "TEXT")
    addColumnIfMissing(db, "jobs", "upload_bytes", "INTEGER NOT NULL DEFAULT 0")
    addColumnIfMissing(db, "jobs", "ocr_pages_used", "INTEGER NOT NULL DEFAULT 0")
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_user_created_id ON jobs(user_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_jobs_created_id ON jobs(created_at DESC, id DESC);
    `)
  }
  if (tableExists(db, "users")) {
    addColumnIfMissing(db, "users", "username", "TEXT")
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)")
  }
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { name: string } | undefined
  return Boolean(row)
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!rows.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
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
