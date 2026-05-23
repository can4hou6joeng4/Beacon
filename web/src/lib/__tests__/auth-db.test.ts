import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createAuditDbForPath } from "../audit-db"
import { createAuthDbForPath } from "../auth-db"
import { hashToken } from "../auth-crypto"

let tempDir: string | null = null

function tempDbPath(): string {
  tempDir = mkdtempSync(join(tmpdir(), "pdf-auth-db-"))
  return join(tempDir, "audit.sqlite")
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe("auth db", () => {
  it("creates users, stores hashed sessions, and returns quota snapshots", async () => {
    const dbPath = tempDbPath()
    const authDb = await createAuthDbForPath(dbPath)
    const user = await authDb.createUser({
      email: " Admin@Example.COM ",
      name: "Admin",
      role: "admin",
      passwordHash: "password-hash",
      passwordSalt: "password-salt",
      passwordIterations: 1_000,
      quota: {
        uploadBytesLimit: 1024,
        ocrJobsLimit: 3,
        ocrPagesLimit: 200,
      },
    })

    expect(user).toMatchObject({
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
      status: "active",
      quota: {
        quota: {
          uploadBytesLimit: 1024,
          ocrJobsLimit: 3,
          ocrPagesLimit: 200,
        },
        usage: { uploadBytes: 0, ocrJobs: 0, ocrPages: 0 },
        remaining: { uploadBytes: 1024, ocrJobs: 3, ocrPages: 200 },
      },
    })

    const rawToken = "raw-session-token"
    const tokenHash = await hashToken(rawToken)
    const session = await authDb.createSession({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      userAgent: "vitest",
    })

    await expect(authDb.getContextByTokenHash(rawToken)).resolves.toBeNull()
    await expect(authDb.getContextByTokenHash(tokenHash)).resolves.toMatchObject({
      user: { id: user.id, email: "admin@example.com" },
      session: { id: session.id, userId: user.id },
      quota: { remaining: { uploadBytes: 1024, ocrJobs: 3, ocrPages: 200 } },
    })
  })

  it("accounts quota usage from reserve consume and refund ledger entries", async () => {
    const dbPath = tempDbPath()
    const auditDb = await createAuditDbForPath(dbPath)
    const authDb = await createAuthDbForPath(dbPath)
    const user = await authDb.createUser({
      email: "user@example.com",
      name: "User",
      role: "user",
      passwordHash: "password-hash",
      passwordSalt: "password-salt",
      passwordIterations: 1_000,
      quota: {
        uploadBytesLimit: 1_000,
        ocrJobsLimit: 2,
        ocrPagesLimit: 30,
      },
    })
    const job = await auditDb.createJob({ filename: "quota.pdf", cutoff: "2026-05-22", userId: user.id })

    await authDb.addQuotaLedger({ userId: user.id, jobId: job.id, resource: "upload_bytes", action: "reserve", amount: 400, reason: "test_upload" })
    await authDb.addQuotaLedger({ userId: user.id, jobId: job.id, resource: "upload_bytes", action: "refund", amount: 100, reason: "test_refund" })
    await authDb.addQuotaLedger({ userId: user.id, jobId: job.id, resource: "ocr_jobs", action: "consume", amount: 1, reason: "test_job" })
    await authDb.addQuotaLedger({ userId: user.id, jobId: job.id, resource: "ocr_pages", action: "consume", amount: 12, reason: "test_pages" })
    await authDb.addQuotaLedger({ userId: user.id, resource: "upload_bytes", action: "adjust", amount: 999, reason: "audit_only" })

    await expect(authDb.getQuotaSnapshot(user.id)).resolves.toMatchObject({
      usage: { uploadBytes: 300, ocrJobs: 1, ocrPages: 12 },
      remaining: { uploadBytes: 700, ocrJobs: 1, ocrPages: 18 },
    })
  })

  it("updates user status and quota without changing usage history", async () => {
    const dbPath = tempDbPath()
    const authDb = await createAuthDbForPath(dbPath)
    const user = await authDb.createUser({
      email: "editor@example.com",
      name: "Editor",
      role: "user",
      passwordHash: "password-hash",
      passwordSalt: "password-salt",
      passwordIterations: 1_000,
      quota: {
        uploadBytesLimit: 100,
        ocrJobsLimit: 1,
        ocrPagesLimit: 10,
      },
    })

    const updated = await authDb.updateUser(user.id, {
      name: "Disabled Editor",
      role: "admin",
      status: "disabled",
      quota: {
        uploadBytesLimit: 500,
        ocrJobsLimit: 5,
        ocrPagesLimit: 50,
      },
    })

    expect(updated).toMatchObject({
      name: "Disabled Editor",
      role: "admin",
      status: "disabled",
      quota: {
        quota: { uploadBytesLimit: 500, ocrJobsLimit: 5, ocrPagesLimit: 50 },
        usage: { uploadBytes: 0, ocrJobs: 0, ocrPages: 0 },
        remaining: { uploadBytes: 500, ocrJobs: 5, ocrPages: 50 },
      },
    })
  })
})
