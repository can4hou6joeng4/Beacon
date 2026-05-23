import type { AuditHistoryJob, AuditStatusValue, AuditSummary } from "./audit-types"
import { getCloudflareD1Binding } from "./cloudflare-env"

export type AuditRuntime = "local-python" | "paddleocr"

export type CreateJobInput = {
  id?: string
  filename: string
  cutoff: string
  userId?: string | null
  runtime?: AuditRuntime
  objectKey?: string
  uploadBytes?: number
}

export type ManifestPatch = {
  certificate_pages?: number
}

export type AuditStatusPatch = {
  status: AuditStatusValue
  message?: string
  summary?: AuditSummary
}

export type AuditDb = {
  createJob(input: CreateJobInput): Promise<AuditHistoryJob>
  attachPythonJob(id: string, pythonJobId: string): Promise<AuditHistoryJob | null>
  attachProviderJob(id: string, providerJobId: string): Promise<AuditHistoryJob | null>
  updateFromStatus(id: string, status: AuditStatusPatch): Promise<AuditHistoryJob | null>
  updateFromResult(id: string, summary: AuditSummary, manifest?: ManifestPatch): Promise<AuditHistoryJob | null>
  updateOcrPagesUsed(id: string, pages: number): Promise<AuditHistoryJob | null>
  getJob(id: string): Promise<AuditHistoryJob | null>
  getJobForUser(id: string, userId: string, role: "admin" | "user"): Promise<AuditHistoryJob | null>
  getJobByPythonId(pythonJobId: string): Promise<AuditHistoryJob | null>
  listJobs(limit?: number, user?: { id: string; role: "admin" | "user" }): Promise<AuditHistoryJob[]>
}

export async function getAuditDb(): Promise<AuditDb> {
  const d1 = await getCloudflareD1Binding()
  if (d1) {
    const { createAuditD1Db } = await import("./audit-db-d1")
    return createAuditD1Db(d1)
  }

  const { getSqliteAuditDb } = await import("./audit-db-sqlite")
  return getSqliteAuditDb()
}

export async function createAuditDbForPath(dbPath: string): Promise<AuditDb> {
  const { createAuditDbForPath: createSqliteAuditDbForPath } = await import("./audit-db-sqlite")
  return createSqliteAuditDbForPath(dbPath)
}
