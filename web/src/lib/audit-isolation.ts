import type { AuditDb } from "./audit-db"
import type { AuditHistoryJob } from "./audit-types"
import { AppError } from "./app-error"
import type { UserRole } from "./auth-types"

export async function requireAuditJobForUser(input: {
  db: AuditDb
  jobId: string
  userId: string
  role: UserRole
  notFoundMessage?: string
}): Promise<AuditHistoryJob> {
  const job = await input.db.getJobForUser(input.jobId, input.userId, input.role)
  if (!job) {
    throw new AppError(input.notFoundMessage ?? "任务不存在", {
      status: 404,
      code: "AUDIT_JOB_NOT_FOUND",
    })
  }
  return job
}

export function assertJobObjectKeyMatches(job: AuditHistoryJob, objectKey: string): void {
  if (job.objectKey !== objectKey) {
    throw new AppError("任务不存在或对象路径不匹配", {
      status: 404,
      code: "AUDIT_JOB_OBJECT_MISMATCH",
    })
  }
}
