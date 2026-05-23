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

  it("prefers the validity field date over unrelated trailing table dates", () => {
    const jsonl = JSON.stringify({
      result: {
        layoutParsingResults: [
          {
            markdown: {
              text: [
                "执业注册信息截图",
                '有效期：2027年09月25日</td></tr><tr><td colspan="7">2023-09-08 -',
              ].join("\n"),
            },
          },
        ],
      },
    })

    const artifacts = analyzePaddleOcrJsonl({ jobId: "job-table-tail", cutoff: "2026-06-01", jsonl })

    expect(artifacts.result.candidates[0]?.expiry_date).toBe("2027-09-25")
    expect(artifacts.result.matches).toHaveLength(0)
  })

  it("keeps adjacent validity fields independent when extracting expiry dates", () => {
    const jsonl = JSON.stringify({
      result: {
        layoutParsingResults: [
          {
            markdown: {
              text: [
                "项目评审结论表",
                "使用有效期：2026年03月02日",
                "有效期至 2026年05月31日",
              ].join("\n"),
            },
          },
        ],
      },
    })

    const artifacts = analyzePaddleOcrJsonl({ jobId: "job-neighbor-fields", cutoff: "2026-04-01", jsonl })
    const candidates = artifacts.result.candidates.map((row) => ({
      field: row.field_context,
      expiry: row.expiry_date,
    }))

    expect(candidates).toEqual([
      { field: "使用有效期：2026年03月02日", expiry: "2026-03-02" },
      { field: "有效期至 2026年05月31日", expiry: "2026-05-31" },
    ])
    expect(artifacts.result.matches[0]?.expiry_date).toBe("2026-03-02")
  })
})
