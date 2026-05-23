import { describe, expect, it, vi } from "vitest"
import { createUser } from "../auth"
import { BYTES_PER_GIGABYTE, DEFAULT_UPLOAD_QUOTA_BYTES, PADDLEOCR_DAILY_PDF_PAGE_LIMIT } from "../quota-limits"

vi.mock("../auth-db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth-db")>()
  return {
    ...actual,
    getAuthDb: vi.fn(() => ({
      createUser: vi.fn(),
    })),
  }
})

describe("auth quota validation", () => {
  it("rejects upload quotas above the Cloudflare R2 free storage tier", async () => {
    await expect(createUser({
      email: "quota@example.com",
      name: "Quota",
      password: "long-password",
      role: "user",
      quota: {
        uploadBytesLimit: DEFAULT_UPLOAD_QUOTA_BYTES + BYTES_PER_GIGABYTE,
        ocrJobsLimit: 25,
        ocrPagesLimit: PADDLEOCR_DAILY_PDF_PAGE_LIMIT,
      },
    })).rejects.toMatchObject({
      status: 400,
      code: "UPLOAD_QUOTA_LIMIT_EXCEEDED",
    })
  })

  it("rejects OCR page quotas above the PaddleOCR daily PDF page limit", async () => {
    await expect(createUser({
      email: "ocr@example.com",
      name: "OCR",
      password: "long-password",
      role: "user",
      quota: {
        uploadBytesLimit: DEFAULT_UPLOAD_QUOTA_BYTES,
        ocrJobsLimit: 25,
        ocrPagesLimit: PADDLEOCR_DAILY_PDF_PAGE_LIMIT + 1,
      },
    })).rejects.toMatchObject({
      status: 400,
      code: "OCR_PAGE_LIMIT_EXCEEDED",
    })
  })
})
