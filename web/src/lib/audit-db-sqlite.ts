import Database from "better-sqlite3"
import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import type { AuditHistoryJob, AuditStatusValue, AuditSummary } from "./audit-types"
import type { AuditDb, AuditStatusPatch, CreateJobInput, ManifestPatch } from "./audit-db"

type JobRow = {
  id: string
  user_id: string | null
  python_job_id: string | null
  provider_job_id: string | null
  object_key: string | null
  runtime: "local-python" | "paddleocr"
  filename: string
  cutoff: string
  status: AuditStatusValue
  message: string
  created_at: string
  updated_at: string
  completed_at: string | null
  pages_ocr: number
  ocr_error_pages: number
  ocr_total_pages: number
  certificate_pages: number
  validity_candidates: number
  matches: number
  near_expiry: number
  needs_review: number
  upload_bytes: number
  ocr_pages_used: number
}

let singleton: AuditDb | null = null

export function getSqliteAuditDb(): AuditDb {
  if (!singleton) {
    const dbPath = process.env.AUDIT_DB_PATH ?? join(process.cwd(), "data", "audit.sqlite")
    singleton = createAuditDbForPath(dbPath)
  }
  return singleton
}

export function createAuditDbForPath(dbPath: string): AuditDb {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma("journal_mode = WAL")
  migrate(db)

  return {
    async createJob(input: CreateJobInput) {
      const now = new Date().toISOString()
      const id = input.id ?? randomUUID()
      db.prepare(`
        INSERT INTO jobs (
          id, user_id, python_job_id, provider_job_id, object_key, runtime, filename, cutoff, status, message, created_at, updated_at,
          completed_at, pages_ocr, ocr_error_pages, ocr_total_pages, certificate_pages, validity_candidates, matches,
          near_expiry, needs_review, upload_bytes, ocr_pages_used
        )
        VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, 'queued', '等待上传', ?, ?, NULL, 0, 0, 0, 0, 0, 0, 0, 0, ?, 0)
      `).run(
        id,
        input.userId ?? null,
        input.objectKey ?? null,
        input.runtime ?? "local-python",
        input.filename,
        input.cutoff,
        now,
        now,
        input.uploadBytes ?? 0,
      )
      return mapRow(db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow)
    },

    async attachPythonJob(id: string, pythonJobId: string) {
      const now = new Date().toISOString()
      db.prepare("UPDATE jobs SET python_job_id = ?, status = 'queued', message = '任务已创建', updated_at = ? WHERE id = ?").run(
        pythonJobId,
        now,
        id,
      )
      return this.getJob(id)
    },

    async attachProviderJob(id: string, providerJobId: string) {
      const now = new Date().toISOString()
      db.prepare("UPDATE jobs SET provider_job_id = ?, status = 'queued', message = 'PaddleOCR 任务已创建', updated_at = ? WHERE id = ?").run(
        providerJobId,
        now,
        id,
      )
      return this.getJob(id)
    },

    async updateFromStatus(id: string, status: AuditStatusPatch) {
      const now = new Date().toISOString()
      const completedAt = status.status === "complete" ? now : null
      if (status.summary) {
        db.prepare(`
          UPDATE jobs
          SET status = ?,
              message = ?,
              updated_at = ?,
              completed_at = COALESCE(completed_at, ?),
              pages_ocr = ?,
              ocr_error_pages = ?,
              ocr_total_pages = ?,
              certificate_pages = ?,
              validity_candidates = ?,
              matches = ?,
              near_expiry = ?,
              needs_review = ?
          WHERE id = ?
        `).run(
          status.status,
          status.message ?? status.status,
          now,
          completedAt,
          status.summary.pages_ocr,
          status.summary.ocr_error_pages ?? 0,
          status.summary.ocr_total_pages ?? status.summary.pages_ocr + (status.summary.ocr_error_pages ?? 0),
          status.summary.pages_ocr,
          status.summary.validity_candidates,
          status.summary.matches,
          status.summary.near_expiry,
          status.summary.needs_review,
          id,
        )
      } else {
        db.prepare(`
          UPDATE jobs
          SET status = ?, message = ?, updated_at = ?, completed_at = COALESCE(completed_at, ?)
          WHERE id = ?
        `).run(status.status, status.message ?? status.status, now, completedAt, id)
      }
      return this.getJob(id)
    },

    async updateFromResult(id: string, summary: AuditSummary, manifest: ManifestPatch = {}) {
      const now = new Date().toISOString()
      db.prepare(`
        UPDATE jobs
        SET status = 'complete',
            message = '检查完成',
            updated_at = ?,
            completed_at = COALESCE(completed_at, ?),
            pages_ocr = ?,
            ocr_error_pages = ?,
            ocr_total_pages = ?,
            certificate_pages = ?,
            validity_candidates = ?,
            matches = ?,
            near_expiry = ?,
            needs_review = ?
        WHERE id = ?
      `).run(
        now,
        now,
        summary.pages_ocr,
        summary.ocr_error_pages ?? 0,
        summary.ocr_total_pages ?? summary.pages_ocr + (summary.ocr_error_pages ?? 0),
        manifest.certificate_pages ?? summary.pages_ocr,
        summary.validity_candidates,
        summary.matches,
        summary.near_expiry,
        summary.needs_review,
        id,
      )
      return this.getJob(id)
    },

    async updateOcrPagesUsed(id: string, pages: number) {
      const now = new Date().toISOString()
      db.prepare("UPDATE jobs SET ocr_pages_used = ?, updated_at = ? WHERE id = ?").run(pages, now, id)
      return this.getJob(id)
    },

    async getJob(id: string) {
      const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined
      return row ? mapRow(row) : null
    },

    async getJobForUser(id: string, userId: string, role: "admin" | "user") {
      if (role === "admin") return this.getJob(id)
      const row = db.prepare("SELECT * FROM jobs WHERE id = ? AND user_id = ?").get(id, userId) as JobRow | undefined
      return row ? mapRow(row) : null
    },

    async getJobByPythonId(pythonJobId: string) {
      const row = db.prepare("SELECT * FROM jobs WHERE python_job_id = ?").get(pythonJobId) as JobRow | undefined
      return row ? mapRow(row) : null
    },

    async listJobs(limit = 20, user) {
      const rows = user?.role === "user"
        ? db.prepare("SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?").all(user.id, limit) as JobRow[]
        : db.prepare("SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC LIMIT ?").all(limit) as JobRow[]
      return rows.map(mapRow)
    },
  }
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          python_job_id TEXT UNIQUE,
          provider_job_id TEXT,
          object_key TEXT,
          runtime TEXT NOT NULL DEFAULT 'local-python',
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
      needs_review INTEGER NOT NULL DEFAULT 0
      , upload_bytes INTEGER NOT NULL DEFAULT 0
      , ocr_pages_used INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_python_job_id ON jobs(python_job_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_provider_job_id ON jobs(provider_job_id);
  `)
  addColumnIfMissing(db, "jobs", "ocr_error_pages", "INTEGER NOT NULL DEFAULT 0")
  addColumnIfMissing(db, "jobs", "ocr_total_pages", "INTEGER NOT NULL DEFAULT 0")
  addColumnIfMissing(db, "jobs", "provider_job_id", "TEXT")
  addColumnIfMissing(db, "jobs", "object_key", "TEXT")
  addColumnIfMissing(db, "jobs", "runtime", "TEXT NOT NULL DEFAULT 'local-python'")
  addColumnIfMissing(db, "jobs", "user_id", "TEXT")
  addColumnIfMissing(db, "jobs", "upload_bytes", "INTEGER NOT NULL DEFAULT 0")
  addColumnIfMissing(db, "jobs", "ocr_pages_used", "INTEGER NOT NULL DEFAULT 0")
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_user_created_id ON jobs(user_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_id ON jobs(created_at DESC, id DESC);
  `)
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!rows.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function mapRow(row: JobRow): AuditHistoryJob {
  return {
    id: row.id,
    userId: row.user_id,
    pythonJobId: row.python_job_id,
    providerJobId: row.provider_job_id,
    objectKey: row.object_key,
    runtime: row.runtime,
    filename: row.filename,
    cutoff: row.cutoff,
    status: row.status,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    pagesOcr: row.pages_ocr,
    ocrErrorPages: row.ocr_error_pages,
    ocrTotalPages: row.ocr_total_pages,
    certificatePages: row.certificate_pages,
    validityCandidates: row.validity_candidates,
    matches: row.matches,
    nearExpiry: row.near_expiry,
    needsReview: row.needs_review,
    uploadBytes: row.upload_bytes,
    ocrPagesUsed: row.ocr_pages_used,
  }
}
