import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createAuditDbForPath } from "../audit-db"
import { assertJobObjectKeyMatches, requireAuditJobForUser } from "../audit-isolation"
import type { AuthContext } from "../auth-types"

let tempDir: string | null = null
const originalAuditDbPath = process.env.AUDIT_DB_PATH

function tempDbPath(): string {
  tempDir = mkdtempSync(join(tmpdir(), "pdf-audit-isolation-"))
  return join(tempDir, "audit.sqlite")
}

function authContext(input: { id: string; role?: "admin" | "user" }): AuthContext {
  const now = new Date().toISOString()
  const quota = {
    quota: {
      userId: input.id,
      uploadBytesLimit: 1_000,
      ocrJobsLimit: 10,
      ocrPagesLimit: 100,
      period: "lifetime" as const,
      updatedAt: now,
    },
    usage: { uploadBytes: 0, ocrJobs: 0, ocrPages: 0 },
    remaining: { uploadBytes: 1_000, ocrJobs: 10, ocrPages: 100 },
  }
  return {
    user: {
      id: input.id,
      username: input.id,
      email: `${input.id}@example.com`,
      name: input.id,
      role: input.role ?? "user",
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    },
    quota,
    session: {
      id: `${input.id}-session`,
      userId: input.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: now,
      lastSeenAt: now,
    },
  }
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

describe("audit job isolation", () => {
  it("allows normal users to load only their own jobs while admins can load all jobs", async () => {
    const db = await createAuditDbForPath(tempDbPath())
    const own = await db.createJob({ filename: "own.pdf", cutoff: "2026-05-22", userId: "user-a" })
    const other = await db.createJob({ filename: "other.pdf", cutoff: "2026-05-22", userId: "user-b" })

    await expect(requireAuditJobForUser({ db, jobId: own.id, userId: "user-a", role: "user" })).resolves.toMatchObject({ id: own.id })
    await expect(requireAuditJobForUser({ db, jobId: other.id, userId: "user-a", role: "user" })).rejects.toMatchObject({
      status: 404,
      code: "AUDIT_JOB_NOT_FOUND",
    })
    await expect(requireAuditJobForUser({ db, jobId: other.id, userId: "admin", role: "admin" })).resolves.toMatchObject({
      id: other.id,
    })
  })

  it("rejects provider submission payloads when the object key does not belong to the authorized job", async () => {
    const db = await createAuditDbForPath(tempDbPath())
    const own = await db.createJob({
      id: "job-a",
      filename: "own.pdf",
      cutoff: "2026-05-22",
      userId: "user-a",
      runtime: "paddleocr",
      objectKey: "jobs/job-a/input.pdf",
      uploadBytes: 1024,
    })
    const other = await db.createJob({
      id: "job-b",
      filename: "other.pdf",
      cutoff: "2026-05-22",
      userId: "user-b",
      runtime: "paddleocr",
      objectKey: "jobs/job-b/input.pdf",
      uploadBytes: 1024,
    })

    const authorized = await requireAuditJobForUser({ db, jobId: own.id, userId: "user-a", role: "user" })

    expect(() => assertJobObjectKeyMatches(authorized, own.objectKey ?? "")).not.toThrow()
    let mismatchError: unknown
    try {
      assertJobObjectKeyMatches(authorized, other.objectKey ?? "")
    } catch (error) {
      mismatchError = error
    }
    expect(mismatchError).toMatchObject({
      message: "任务不存在或对象路径不匹配",
      status: 404,
      code: "AUDIT_JOB_OBJECT_MISMATCH",
    })
  })

  it("keeps OCR quota ledger consumption scoped to the job owner even when an admin submits work", async () => {
    const dbPath = tempDbPath()
    process.env.AUDIT_DB_PATH = dbPath
    vi.resetModules()
    const { createAuditDbForPath: createAuditDb } = await import("../audit-db")
    const { createAuthDbForPath } = await import("../auth-db")
    const { consumeOcrJobQuota, consumeOcrPageQuota } = await import("../quota")
    const auditDb = await createAuditDb(dbPath)
    const authDb = await createAuthDbForPath(dbPath)
    const owner = await authDb.createUser({
      username: "owner",
      email: "owner@example.com",
      name: "Owner",
      role: "user",
      passwordHash: "password-hash",
      passwordSalt: "password-salt",
      passwordIterations: 1_000,
      quota: { uploadBytesLimit: 1_000, ocrJobsLimit: 3, ocrPagesLimit: 10 },
    })
    const admin = await authDb.createUser({
      username: "admin",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
      passwordHash: "password-hash",
      passwordSalt: "password-salt",
      passwordIterations: 1_000,
      quota: { uploadBytesLimit: 1_000, ocrJobsLimit: 3, ocrPagesLimit: 10 },
    })
    const job = await auditDb.createJob({ filename: "owner.pdf", cutoff: "2026-05-22", userId: owner.id })

    await consumeOcrJobQuota({ context: authContext({ id: admin.id, role: "admin" }), jobId: job.id, userId: owner.id })
    await consumeOcrPageQuota({ context: authContext({ id: admin.id, role: "admin" }), jobId: job.id, userId: owner.id, pages: 4 })

    await expect(authDb.getQuotaSnapshot(owner.id)).resolves.toMatchObject({
      usage: { ocrJobs: 1, ocrPages: 4 },
      remaining: { ocrJobs: 2, ocrPages: 6 },
    })
    await expect(authDb.getQuotaSnapshot(admin.id)).resolves.toMatchObject({
      usage: { ocrJobs: 0, ocrPages: 0 },
      remaining: { ocrJobs: 3, ocrPages: 10 },
    })
  })
})
