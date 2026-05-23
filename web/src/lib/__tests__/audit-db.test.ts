import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createAuditDbForPath } from "../audit-db"

let tempDir: string | null = null

function tempDbPath() {
  tempDir = mkdtempSync(join(tmpdir(), "pdf-audit-db-"))
  return join(tempDir, "audit.sqlite")
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe("audit db", () => {
  it("creates, attaches python job id, updates summary, and lists newest first", async () => {
    const db = await createAuditDbForPath(tempDbPath())
    const first = await db.createJob({ filename: "old.pdf", cutoff: "2026-05-07" })
    const second = await db.createJob({ filename: "投标文件.pdf", cutoff: "2026-05-07" })

    await db.attachPythonJob(second.id, "6f6811c2c99949bc8b2c7a431cf5bc78")
    await db.updateFromStatus(second.id, { status: "complete", message: "检查完成" })
    await db.updateFromResult(
      second.id,
      {
        pages_ocr: 184,
        ocr_error_pages: 0,
        ocr_total_pages: 184,
        validity_candidates: 84,
        matches: 0,
        near_expiry: 0,
        needs_review: 3,
        cutoff: "2026-05-07",
      },
      { certificate_pages: 184 },
    )

    const jobs = await db.listJobs()
    expect(jobs.map((job) => job.id)).toEqual([second.id, first.id])
    expect(jobs[0]).toMatchObject({
      pythonJobId: "6f6811c2c99949bc8b2c7a431cf5bc78",
      providerJobId: null,
      objectKey: null,
      runtime: "local-python",
      filename: "投标文件.pdf",
      status: "complete",
      pagesOcr: 184,
      validityCandidates: 84,
      matches: 0,
      needsReview: 3,
    })
  })

  it("persists a completed status summary before result details are opened", async () => {
    const db = await createAuditDbForPath(tempDbPath())
    const job = await db.createJob({ filename: "投标文件.pdf", cutoff: "2026-05-22" })

    await db.attachPythonJob(job.id, "6ab8a1ef300e4398a8729e3f39b7e3cc")
    const updated = await db.updateFromStatus(job.id, {
      status: "complete",
      message: "检查完成",
      summary: {
        pages_ocr: 225,
        ocr_error_pages: 3,
        ocr_total_pages: 228,
        validity_candidates: 99,
        matches: 0,
        near_expiry: 2,
        needs_review: 2,
        cutoff: "2026-05-22",
      },
    })

    expect(updated).toMatchObject({
      status: "complete",
      pagesOcr: 225,
      certificatePages: 225,
      ocrErrorPages: 3,
      ocrTotalPages: 228,
      validityCandidates: 99,
      nearExpiry: 2,
      needsReview: 2,
    })
  })

  it("creates cloud paddleocr jobs and attaches provider job ids", async () => {
    const db = await createAuditDbForPath(tempDbPath())
    const job = await db.createJob({
      filename: "cloud.pdf",
      cutoff: "2026-05-22",
      userId: "user-a",
      runtime: "paddleocr",
      objectKey: "jobs/job-123/input.pdf",
      uploadBytes: 2048,
    })
    const attached = await db.attachProviderJob(job.id, "paddle-job-123")

    expect(attached).toMatchObject({
      id: job.id,
      userId: "user-a",
      filename: "cloud.pdf",
      runtime: "paddleocr",
      objectKey: "jobs/job-123/input.pdf",
      providerJobId: "paddle-job-123",
      pythonJobId: null,
      status: "queued",
      message: "PaddleOCR 任务已创建",
      uploadBytes: 2048,
      ocrPagesUsed: 0,
    })
  })

  it("scopes jobs to normal users while admins can inspect all jobs", async () => {
    const db = await createAuditDbForPath(tempDbPath())
    const own = await db.createJob({ filename: "own.pdf", cutoff: "2026-05-22", userId: "user-a" })
    const other = await db.createJob({ filename: "other.pdf", cutoff: "2026-05-22", userId: "user-b" })

    await expect(db.listJobs(20, { id: "user-a", role: "user" })).resolves.toEqual([own])
    await expect(db.listJobs(20, { id: "admin", role: "admin" })).resolves.toEqual([other, own])
    await expect(db.getJobForUser(other.id, "user-a", "user")).resolves.toBeNull()
    await expect(db.getJobForUser(other.id, "admin", "admin")).resolves.toMatchObject({ id: other.id })
  })
})
