import { randomUUID } from "node:crypto"
import type { AuditDb, AuditStatusPatch, CreateJobInput, ManifestPatch } from "./audit-db"
import type { AuditHistoryJob, AuditStatusValue, AuditSummary } from "./audit-types"

type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike
}

type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<{ results?: T[] }>
  run(): Promise<unknown>
}

type JobRow = {
  id: string
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
}

export function createAuditD1Db(db: unknown): AuditDb {
  const d1 = db as D1DatabaseLike

  return {
    async createJob(input: CreateJobInput) {
      const now = new Date().toISOString()
      const id = randomUUID()
      await d1.prepare(`
        INSERT INTO jobs (
          id, python_job_id, provider_job_id, object_key, runtime, filename, cutoff, status, message, created_at, updated_at,
          completed_at, pages_ocr, ocr_error_pages, ocr_total_pages, certificate_pages, validity_candidates, matches,
          near_expiry, needs_review
        )
        VALUES (?, NULL, NULL, ?, ?, ?, ?, 'queued', '等待上传', ?, ?, NULL, 0, 0, 0, 0, 0, 0, 0, 0)
      `).bind(id, input.objectKey ?? null, input.runtime ?? "local-python", input.filename, input.cutoff, now, now).run()
      return requireJob(await this.getJob(id), id)
    },

    async attachPythonJob(id: string, pythonJobId: string) {
      const now = new Date().toISOString()
      await d1.prepare("UPDATE jobs SET python_job_id = ?, status = 'queued', message = '任务已创建', updated_at = ? WHERE id = ?")
        .bind(pythonJobId, now, id)
        .run()
      return this.getJob(id)
    },

    async attachProviderJob(id: string, providerJobId: string) {
      const now = new Date().toISOString()
      await d1.prepare("UPDATE jobs SET provider_job_id = ?, status = 'queued', message = 'PaddleOCR 任务已创建', updated_at = ? WHERE id = ?")
        .bind(providerJobId, now, id)
        .run()
      return this.getJob(id)
    },

    async updateFromStatus(id: string, status: AuditStatusPatch) {
      const now = new Date().toISOString()
      const completedAt = status.status === "complete" ? now : null
      if (status.summary) {
        await d1.prepare(`
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
        `).bind(
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
        ).run()
      } else {
        await d1.prepare(`
          UPDATE jobs
          SET status = ?, message = ?, updated_at = ?, completed_at = COALESCE(completed_at, ?)
          WHERE id = ?
        `).bind(status.status, status.message ?? status.status, now, completedAt, id).run()
      }
      return this.getJob(id)
    },

    async updateFromResult(id: string, summary: AuditSummary, manifest: ManifestPatch = {}) {
      const now = new Date().toISOString()
      await d1.prepare(`
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
      `).bind(
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
      ).run()
      return this.getJob(id)
    },

    async getJob(id: string) {
      const row = await d1.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first<JobRow>()
      return row ? mapRow(row) : null
    },

    async getJobByPythonId(pythonJobId: string) {
      const row = await d1.prepare("SELECT * FROM jobs WHERE python_job_id = ?").bind(pythonJobId).first<JobRow>()
      return row ? mapRow(row) : null
    },

    async listJobs(limit = 20) {
      const result = await d1.prepare("SELECT * FROM jobs ORDER BY created_at DESC, id DESC LIMIT ?").bind(limit).all<JobRow>()
      return (result.results ?? []).map(mapRow)
    },
  }
}

function requireJob(job: AuditHistoryJob | null, id: string): AuditHistoryJob {
  if (!job) throw new Error(`Audit job was not created: ${id}`)
  return job
}

function mapRow(row: JobRow): AuditHistoryJob {
  return {
    id: row.id,
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
  }
}
