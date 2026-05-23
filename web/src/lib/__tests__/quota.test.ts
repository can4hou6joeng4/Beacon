import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AuthContext } from "../auth-types"

let tempDir: string | null = null
const originalAuditDbPath = process.env.AUDIT_DB_PATH

function tempDbPath(): string {
  tempDir = mkdtempSync(join(tmpdir(), "pdf-quota-db-"))
  return join(tempDir, "audit.sqlite")
}

afterEach(() => {
  if (originalAuditDbPath === undefined) {
    delete process.env.AUDIT_DB_PATH
  } else {
    process.env.AUDIT_DB_PATH = originalAuditDbPath
  }
  vi.resetModules()
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe("quota service", () => {
  it("consumes OCR job/page quota idempotently and blocks exhausted resources", async () => {
    const dbPath = tempDbPath()
    process.env.AUDIT_DB_PATH = dbPath
    vi.resetModules()
    const { createAuditDbForPath } = await import("../audit-db")
    const { createAuthDbForPath } = await import("../auth-db")
    const { consumeOcrJobQuota, consumeOcrPageQuota, ensureUserQuotaAvailable } = await import("../quota")

    const auditDb = await createAuditDbForPath(dbPath)
    const authDb = await createAuthDbForPath(dbPath)
    const user = await authDb.createUser({
      email: "quota@example.com",
      name: "Quota",
      role: "user",
      passwordHash: "password-hash",
      passwordSalt: "password-salt",
      passwordIterations: 1_000,
      quota: {
        uploadBytesLimit: 100,
        ocrJobsLimit: 1,
        ocrPagesLimit: 5,
      },
    })
    const job = await auditDb.createJob({ filename: "quota.pdf", cutoff: "2026-05-22", userId: user.id })
    const context: AuthContext = {
      user,
      quota: user.quota,
      session: {
        id: "session",
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
    }

    await consumeOcrJobQuota({ context, jobId: job.id })
    await consumeOcrJobQuota({ context, jobId: job.id })
    await expect(authDb.getQuotaSnapshot(user.id)).resolves.toMatchObject({
      usage: { ocrJobs: 1 },
      remaining: { ocrJobs: 0 },
    })

    await expect(consumeOcrPageQuota({ context, jobId: job.id, pages: 3 })).resolves.toBe(3)
    await expect(consumeOcrPageQuota({ context, jobId: job.id, pages: 5 })).resolves.toBe(5)
    await expect(authDb.getQuotaSnapshot(user.id)).resolves.toMatchObject({
      usage: { ocrPages: 5 },
      remaining: { ocrPages: 0 },
    })
    await expect(ensureUserQuotaAvailable(user.id, "ocr_pages", 1)).rejects.toMatchObject({
      status: 402,
      code: "QUOTA_EXHAUSTED",
    })
  })
})
