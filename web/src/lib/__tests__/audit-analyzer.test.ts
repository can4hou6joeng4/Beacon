import { describe, expect, it } from "vitest"
import { analyzePaddleOcrJsonl } from "../audit-analyzer"

describe("analyzePaddleOcrJsonl", () => {
  it("turns PaddleOCR markdown JSONL into audit artifacts", () => {
    const jsonl = JSON.stringify({
      result: {
        layoutParsingResults: [
          {
            markdown: {
              text: "一级注册造价工程师注册证\n使用有效期至 2026年06月01日",
            },
          },
          {
            markdown: {
              text: "身份证\n有效期限 长期",
            },
          },
        ],
      },
    })

    const artifacts = analyzePaddleOcrJsonl({ jobId: "job-123", cutoff: "2026-05-22", jsonl })

    expect(artifacts.result.summary).toMatchObject({
      pages_ocr: 2,
      validity_candidates: 2,
      matches: 0,
      near_expiry: 1,
      needs_review: 0,
      cutoff: "2026-05-22",
    })
    expect(artifacts.result.near_expiry[0]?.expiry_date).toBe("2026-06-01")
    expect(artifacts.ocrText).toContain("SOURCE\tpaddleocr")
    expect(artifacts.csv).toBe("page,title,expiry_date,context\n")
  })
})
