import type { AuditHistoryJob, AuditStatusValue, AuditSummary } from "./audit-types"

export type AuditRuntime = "local-python" | "paddleocr"

export type CreateJobInput = {
  filename: string
  cutoff: string
  runtime?: AuditRuntime
  objectKey?: string
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
  getJob(id: string): Promise<AuditHistoryJob | null>
  getJobByPythonId(pythonJobId: string): Promise<AuditHistoryJob | null>
  listJobs(limit?: number): Promise<AuditHistoryJob[]>
}

type CloudflareBindings = {
  AUDIT_DB?: unknown
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

async function getCloudflareD1Binding(): Promise<unknown | null> {
  if (process.env.AUDIT_DB_DRIVER === "sqlite") return null
  if (process.env.NEXT_RUNTIME !== "nodejs" && !process.env.OPEN_NEXT_BUILD_ID) return null

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    const context = await getCloudflareContext({ async: true })
    const env = context.env as CloudflareBindings
    return env.AUDIT_DB ?? null
  } catch {
    return null
  }
}
