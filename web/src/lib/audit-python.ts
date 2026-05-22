import type { AuditResult, AuditSummary, PythonJobStatus } from "./audit-types"

export const PYTHON_AUDIT_BASE_URL = process.env.PYTHON_AUDIT_BASE_URL ?? "http://127.0.0.1:8787"
export const PYTHON_AUDIT_TOKEN = process.env.PDF_CHECKER_TOKEN ?? ""

export type StageState = {
  activeStep: number
  failed: boolean
  complete: boolean
  label: string
}

export function withPythonToken(path: string) {
  const url = new URL(path, PYTHON_AUDIT_BASE_URL)
  if (PYTHON_AUDIT_TOKEN) {
    url.searchParams.set("token", PYTHON_AUDIT_TOKEN)
  }
  return url
}

export function stageFromStatus(status: PythonJobStatus): StageState {
  const label = status.message || status.status
  if (status.status === "queued") return { activeStep: 1, failed: false, complete: false, label }
  if (status.status === "running") return { activeStep: 3, failed: false, complete: false, label }
  if (status.status === "complete") return { activeStep: 5, failed: false, complete: true, label }
  if (status.status === "failed") return { activeStep: 3, failed: true, complete: false, label }
  return { activeStep: 1, failed: false, complete: false, label }
}

export function resultDistribution(summary: AuditSummary) {
  const flagged = summary.matches + summary.near_expiry + summary.needs_review
  const ok = Math.max(summary.validity_candidates - flagged, 0)
  return [
    { name: "早于截止", value: summary.matches, kind: "danger" as const },
    { name: "临近到期", value: summary.near_expiry, kind: "warning" as const },
    { name: "需要复核", value: summary.needs_review, kind: "review" as const },
    { name: "有效", value: ok, kind: "ok" as const },
  ]
}

export async function createPythonJob(formData: FormData): Promise<{ job_id: string }> {
  const response = await fetch(withPythonToken("/api/jobs"), {
    method: "POST",
    body: formData,
    cache: "no-store",
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.error || `Python upload request failed: ${response.status}`)
  }
  return response.json() as Promise<{ job_id: string }>
}

export async function createPythonJobFromBlob(input: {
  filename: string
  cutoff: string
  contentType: string
  blob: Blob
}): Promise<{ job_id: string }> {
  const formData = new FormData()
  formData.append("pdf", input.blob, input.filename)
  formData.append("cutoff", input.cutoff)
  return createPythonJob(formData)
}

export async function fetchPythonStatus(pythonJobId: string): Promise<PythonJobStatus> {
  const response = await fetch(withPythonToken(`/api/jobs/${pythonJobId}/status`), { cache: "no-store" })
  if (!response.ok) throw new Error(`Python status request failed: ${response.status}`)
  return response.json() as Promise<PythonJobStatus>
}

export async function fetchPythonResult(pythonJobId: string): Promise<AuditResult> {
  const response = await fetch(withPythonToken(`/api/jobs/${pythonJobId}/result`), { cache: "no-store" })
  if (!response.ok) throw new Error(`Python result request failed: ${response.status}`)
  return response.json() as Promise<AuditResult>
}

export async function fetchPythonDownload(pythonJobId: string, file: string) {
  const response = await fetch(withPythonToken(`/api/jobs/${pythonJobId}/${file}`), { cache: "no-store" })
  if (!response.ok) throw new Error(`Python download request failed: ${response.status}`)
  return response
}
