import type { AuditJobStatus, AuditSummary } from "./audit-types"

export type StageState = {
  activeStep: number
  failed: boolean
  complete: boolean
  label: string
}

export function stageFromStatus(status: AuditJobStatus): StageState {
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
