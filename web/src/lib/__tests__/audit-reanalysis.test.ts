import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createAuditDbForPath } from "../audit-db"
import { reanalyzePaddleOcrJobArtifacts } from "../audit-reanalysis"
import { createCloudObjectStoreConfig, fetchCloudObjectText, putCloudObjectText, type R2BucketLike } from "../cloud-object-store"

type StoredObject = {
  value: Blob
  contentType?: string
}

let tempDir: string | null = null

function tempDbPath(): string {
  tempDir = mkdtempSync(join(tmpdir(), "pdf-audit-reanalysis-"))
  return join(tempDir, "audit.sqlite")
}

function createMemoryBucket(): { bucket: R2BucketLike; objects: Map<string, StoredObject> } {
  const objects = new Map<string, StoredObject>()
  const bucket: R2BucketLike = {
    async put(key, value, options) {
      const blob = value instanceof Blob ? value : new Blob([value])
      objects.set(key, { value: blob, contentType: options?.httpMetadata?.contentType })
    },
    async get(key) {
      const object = objects.get(key)
      if (!object) return null
      return {
        size: object.value.size,
        httpMetadata: { contentType: object.contentType },
        text: () => object.value.text(),
        blob: () => Promise.resolve(object.value),
      }
    },
  }
  return { bucket, objects }
}

function paddleOcrJsonl(markdown: string): string {
  return JSON.stringify({
    result: {
      layoutParsingResults: [
        {
          markdown: { text: markdown },
        },
      ],
    },
  })
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  tempDir = null
})

describe("reanalyzePaddleOcrJobArtifacts", () => {
  it("reuses saved PaddleOCR JSONL to overwrite artifacts and refresh the job summary", async () => {
    const db = await createAuditDbForPath(tempDbPath())
    const config = createCloudObjectStoreConfig({
      AUDIT_OBJECT_STORE_DRIVER: "r2-binding",
      AUDIT_OBJECT_PREFIX: "jobs",
    })
    const { bucket } = createMemoryBucket()
    const created = await db.createJob({
      id: "job-123",
      filename: "cloud.pdf",
      cutoff: "2026-05-22",
      userId: "user-a",
      runtime: "paddleocr",
      objectKey: "jobs/job-123/input.pdf",
      uploadBytes: 2048,
    })
    const attached = await db.attachProviderJob(created.id, "paddle-job-123")
    expect(attached).not.toBeNull()
    await db.updateFromStatus(created.id, { status: "complete", message: "PaddleOCR 解析完成" })
    await db.updateOcrPagesUsed(created.id, 9)
    const completed = await db.getJob(created.id)
    expect(completed).not.toBeNull()

    await putCloudObjectText({
      objectKey: "jobs/job-123/paddleocr.jsonl",
      content: paddleOcrJsonl(
        [
          "中华人民共和国 一级造价工程师注册证书",
          "使用有效期：2026年03月25日",
          "· 2026年06月23日",
        ].join("\n"),
      ),
      contentType: "application/x-ndjson; charset=utf-8",
      config,
      bucket,
    })
    await putCloudObjectText({
      objectKey: "jobs/job-123/result.json",
      content: JSON.stringify({ stale: true }),
      contentType: "application/json; charset=utf-8",
      config,
      bucket,
    })

    const output = await reanalyzePaddleOcrJobArtifacts({
      db,
      job: completed ?? created,
      config,
      bucket,
    })

    expect(output.result.candidates[0]?.expiry_date).toBe("2026-06-23")
    expect(output.result.summary).toMatchObject({
      pages_ocr: 1,
      validity_candidates: 1,
      matches: 0,
      near_expiry: 1,
      needs_review: 0,
      cutoff: "2026-05-22",
    })
    expect(output.job).toMatchObject({
      id: "job-123",
      status: "complete",
      pagesOcr: 1,
      validityCandidates: 1,
      matches: 0,
      nearExpiry: 1,
      needsReview: 0,
      ocrPagesUsed: 9,
    })
    await expect(fetchCloudObjectText({ objectKey: "jobs/job-123/ocr.txt", config, bucket })).resolves.toContain("SOURCE\tpaddleocr")
    await expect(fetchCloudObjectText({ objectKey: "jobs/job-123/matches.csv", config, bucket })).resolves.toBe(
      "page,title,expiry_date,context\n",
    )
    const savedResult = await fetchCloudObjectText({ objectKey: "jobs/job-123/result.json", config, bucket })
    expect(JSON.parse(savedResult)).toMatchObject({
      job_id: "job-123",
      summary: {
        near_expiry: 1,
      },
    })
  })

  it("rejects unfinished jobs before reading storage", async () => {
    const db = await createAuditDbForPath(tempDbPath())
    const config = createCloudObjectStoreConfig({
      AUDIT_OBJECT_STORE_DRIVER: "r2-binding",
      AUDIT_OBJECT_PREFIX: "jobs",
    })
    const { bucket, objects } = createMemoryBucket()
    const job = await db.createJob({
      id: "job-running",
      filename: "cloud.pdf",
      cutoff: "2026-05-22",
      userId: "user-a",
      runtime: "paddleocr",
      objectKey: "jobs/job-running/input.pdf",
      uploadBytes: 2048,
    })

    await expect(reanalyzePaddleOcrJobArtifacts({ db, job, config, bucket })).rejects.toThrow("仅支持重新分析已完成的历史任务")
    expect(objects.size).toBe(0)
  })

  it("returns a user-readable error when the saved PaddleOCR JSONL artifact is missing", async () => {
    const db = await createAuditDbForPath(tempDbPath())
    const config = createCloudObjectStoreConfig({
      AUDIT_OBJECT_STORE_DRIVER: "r2-binding",
      AUDIT_OBJECT_PREFIX: "jobs",
    })
    const { bucket } = createMemoryBucket()
    const job = await db.createJob({
      id: "job-missing-jsonl",
      filename: "cloud.pdf",
      cutoff: "2026-05-22",
      userId: "user-a",
      runtime: "paddleocr",
      objectKey: "jobs/job-missing-jsonl/input.pdf",
      uploadBytes: 2048,
    })
    await db.updateFromStatus(job.id, { status: "complete", message: "PaddleOCR 解析完成" })
    const completed = await db.getJob(job.id)

    await expect(reanalyzePaddleOcrJobArtifacts({ db, job: completed ?? job, config, bucket })).rejects.toThrow(
      "历史记录缺少 PaddleOCR 原始结果，无法重新分析",
    )
  })
})
