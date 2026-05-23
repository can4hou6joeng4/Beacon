import { describe, expect, it } from "vitest"
import {
  assertSafeObjectKey,
  createCloudObjectStoreConfig,
  fetchCloudObjectBlob,
  createPresignedGetUrl,
  createPresignedPutUrl,
  siblingObjectKey,
  generateAuditObjectKey,
  putCloudObject,
  type R2BucketLike,
  validateCloudUploadInput,
} from "../cloud-object-store"

const baseEnv = {
  AUDIT_OBJECT_STORE_DRIVER: "r2-s3",
  AUDIT_OBJECT_STORE_ENDPOINT: "https://example-account.r2.cloudflarestorage.com/",
  AUDIT_OBJECT_BUCKET: "pdf-audit-artifacts",
  AUDIT_OBJECT_ACCESS_KEY_ID: "access-key",
  AUDIT_OBJECT_SECRET_ACCESS_KEY: "secret-key",
  AUDIT_OBJECT_PREFIX: "jobs",
}

describe("cloud object store config", () => {
  it("normalizes r2-s3 configuration", () => {
    expect(createCloudObjectStoreConfig(baseEnv)).toMatchObject({
      driver: "r2-s3",
      endpoint: "https://example-account.r2.cloudflarestorage.com",
      bucket: "pdf-audit-artifacts",
      region: "auto",
      prefix: "jobs",
      uploadExpiresSeconds: 900,
      downloadExpiresSeconds: 3600,
    })
  })
})

describe("cloud upload validation", () => {
  it("accepts PDF metadata and rejects non-PDF files", () => {
    expect(validateCloudUploadInput({ filename: "投标文件.pdf", size: 1024 })).toEqual({
      filename: "投标文件.pdf",
      size: 1024,
      contentType: "application/pdf",
    })
    expect(() => validateCloudUploadInput({ filename: "投标文件.docx", size: 1024 })).toThrow("请上传 PDF 文件")
  })
})

describe("object key safety", () => {
  it("generates deterministic job object keys when a job id is supplied", () => {
    expect(generateAuditObjectKey({ filename: "投标文件.pdf", prefix: "jobs", jobId: "job-123" })).toBe("jobs/job-123/input.pdf")
  })

  it("rejects keys outside the configured prefix", () => {
    expect(() => assertSafeObjectKey("other/job/input.pdf", "jobs")).toThrow("对象存储路径不属于当前审计前缀")
    expect(() => assertSafeObjectKey("jobs/../input.pdf", "jobs")).toThrow("对象存储路径不安全")
  })

  it("derives artifact sibling keys under the same job prefix", () => {
    expect(siblingObjectKey({ objectKey: "jobs/job-123/input.pdf", filename: "result.json", prefix: "jobs" })).toBe(
      "jobs/job-123/result.json",
    )
  })
})

describe("presigned urls", () => {
  it("creates signed PUT and GET URLs for S3-compatible object storage", () => {
    const config = createCloudObjectStoreConfig(baseEnv)
    const now = new Date("2026-05-22T09:00:00.000Z")
    const put = createPresignedPutUrl({ objectKey: "jobs/job-123/input.pdf", contentType: "application/pdf", config, now })
    const get = createPresignedGetUrl({ objectKey: "jobs/job-123/input.pdf", config, now })

    expect(put.objectKey).toBe("jobs/job-123/input.pdf")
    expect(put.expiresAt).toBe("2026-05-22T09:15:00.000Z")
    expect(put.url).toContain("https://example-account.r2.cloudflarestorage.com/pdf-audit-artifacts/jobs/job-123/input.pdf")
    expect(put.url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256")
    expect(put.url).toContain("X-Amz-Signature=")
    expect(put.url).toContain("response-content-type=application%2Fpdf")

    expect(get.expiresAt).toBe("2026-05-22T10:00:00.000Z")
    expect(get.url).toContain("X-Amz-Signature=")
  })
})

describe("R2 binding helpers", () => {
  it("writes and reads binary objects through an injected R2 bucket", async () => {
    const config = createCloudObjectStoreConfig({
      AUDIT_OBJECT_STORE_DRIVER: "r2-binding",
      AUDIT_OBJECT_PREFIX: "jobs",
    })
    const objects = new Map<string, { value: Blob; contentType?: string }>()
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

    await putCloudObject({
      objectKey: "jobs/job-123/input.pdf",
      content: new Blob(["pdf-bytes"], { type: "application/pdf" }),
      contentType: "application/pdf",
      config,
      bucket,
    })

    const object = await fetchCloudObjectBlob({
      objectKey: "jobs/job-123/input.pdf",
      config,
      bucket,
      fallbackContentType: "application/pdf",
    })

    expect(object).toMatchObject({
      objectKey: "jobs/job-123/input.pdf",
      contentType: "application/pdf",
      size: 9,
    })
    await expect(object.blob.text()).resolves.toBe("pdf-bytes")
  })
})
