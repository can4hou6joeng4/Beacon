import { describe, expect, it } from "vitest"
import { analyzePaddleOcrJsonl } from "../audit-analyzer"

function jsonlFromPages(pages: string[]): string {
  return JSON.stringify({
    result: {
      layoutParsingResults: pages.map((text) => ({
        markdown: { text },
      })),
    },
  })
}

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
                "注册证书信息页",
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

  it("uses the later date as the end of a split use-validity range on certificate pages", () => {
    const jsonl = JSON.stringify({
      result: {
        layoutParsingResults: [
          {
            markdown: {
              text: [
                "中华人民共和国 一级造价工程师注册证书",
                "使用有效期：2026年03月25日",
                "· 2026年06月23日",
              ].join("\n"),
            },
          },
          {
            markdown: {
              text: [
                "中华人民共和国 一级造价工程师注册证书",
                "使用有效期：2026年03月10日",
                "· 2026年06月08日",
              ].join("\n"),
            },
          },
        ],
      },
    })

    const artifacts = analyzePaddleOcrJsonl({ jobId: "job-split-use-validity", cutoff: "2026-05-22", jsonl })
    const expiries = artifacts.result.candidates.map((row) => row.expiry_date)

    expect(expiries).toEqual(["2026-06-23", "2026-06-08"])
    expect(artifacts.result.matches).toHaveLength(0)
    expect(artifacts.result.near_expiry.map((row) => row.expiry_date)).toEqual(["2026-06-23", "2026-06-08"])
  })

  it("ignores non-certificate review forms that mention a use-validity field", () => {
    const jsonl = JSON.stringify({
      result: {
        layoutParsingResults: [
          {
            markdown: {
              text: [
                "# 项目评审结论表",
                "使用有效期：2026年03月02日",
                "有效期至 2026年05月31日",
                "评审结论：通过",
              ].join("\n"),
            },
          },
        ],
      },
    })

    const artifacts = analyzePaddleOcrJsonl({ jobId: "job-review-form", cutoff: "2026-04-01", jsonl })

    expect(artifacts.result.summary.validity_candidates).toBe(0)
    expect(artifacts.result.candidates).toEqual([])
    expect(artifacts.result.matches).toEqual([])
    expect(artifacts.result.needs_review).toEqual([])
  })

  it("ignores review-table validity rows on mixed pages while keeping certificate validity rows", () => {
    const jsonl = JSON.stringify({
      result: {
        layoutParsingResults: [
          {
            markdown: {
              text: [
                "# 项目评审结论表",
                "有效期至2024年03月24日",
                "评审结论：通过",
                "中华人民共和国 一级造价工程师注册证书",
                "使用有效期：2026年03月25日",
                "· 2026年06月23日",
              ].join("\n"),
            },
          },
        ],
      },
    })

    const artifacts = analyzePaddleOcrJsonl({ jobId: "job-mixed-review-form", cutoff: "2026-06-01", jsonl })

    expect(artifacts.result.summary.validity_candidates).toBe(1)
    expect(artifacts.result.candidates.map((row) => row.expiry_date)).toEqual(["2026-06-23"])
    expect(artifacts.result.matches).toHaveLength(0)
    expect(artifacts.result.candidates[0]?.field_context).toBe("使用有效期：2026年03月25日 · 2026年06月23日")
  })

  it("handles OCR-spaced and misread validity labels from certificate pages", () => {
    const jsonl = jsonlFromPages([
      "一级造价工程师注册证书\n有 效 期 : 2025年07月21日-2029年07月20日",
      "一级造价工程师注册证书\n有 RM 期 : 2025年12月03日-2029年12月02日",
      "二级造价工程师注册证书\n有 B 期: 2025年12月05日-2029年12月04昌",
      "二级造价工程师注册证书\n有 效 FA: 2025年08月03日-2029年08月03日",
    ])

    const artifacts = analyzePaddleOcrJsonl({ jobId: "job-misread-labels", cutoff: "2026-06-03", jsonl })

    expect(artifacts.result.candidates.map((row) => row.expiry_date)).toEqual([
      "2029-07-20",
      "2029-12-02",
      "2029-12-04",
      "2029-08-03",
    ])
  })

  it("normalizes ID card long-term and compact-tail validity dates", () => {
    const jsonl = jsonlFromPages([
      "身份证\n有效贿限 -2018.10.29-2038.10.29",
      "身份证\n有效期限 2026.03.11-长期",
      "身份证\n有效期限 2021.01.29-2041.0129",
      "身份证\n有效期限 2021.01.29-20410129",
    ])

    const artifacts = analyzePaddleOcrJsonl({ jobId: "job-id-card-validity", cutoff: "2026-06-03", jsonl })

    expect(artifacts.result.candidates.map((row) => row.expiry_date)).toEqual([
      "2038-10-29",
      "长期",
      "2041-01-29",
      "2041-01-29",
    ])
    expect(artifacts.result.matches).toHaveLength(0)
  })

  it("keeps registration change record dates from overriding the expiry date", () => {
    const jsonl = jsonlFromPages([
      "注册证书信息页\n有效期：2028年07月02日 2026-01-07- 机构内变更-安装",
    ])

    const artifacts = analyzePaddleOcrJsonl({ jobId: "job-registration-change", cutoff: "2026-06-03", jsonl })

    expect(artifacts.result.candidates[0]?.expiry_date).toBe("2028-07-02")
    expect(artifacts.result.matches).toHaveLength(0)
  })

  it("uses document use-validity as primary expiry and reviews missing use-validity on primary cost certificates", () => {
    const jsonl = jsonlFromPages([
      [
        "一级注册造价师证（安装）",
        "使用有效期：2026年02月27日",
        "- 2026年05月28日",
        "中华人民共和国",
        "一级造价工程师注册证书",
        "证书编号：建［造］14254400038715",
        "有效期：",
        "2025年07月07日-2029年07月06日",
      ].join("\n"),
      [
        "一级注册造价师证〈安装)",
        "一级造价工程师注册证书",
        "有 效 期: 2025年12月03日-2029年12月02日",
      ].join("\n"),
    ])

    const artifacts = analyzePaddleOcrJsonl({ jobId: "job-use-validity", cutoff: "2026-06-03", jsonl })

    expect(artifacts.result.matches.map((row) => row.expiry_date)).toEqual(["2026-05-28"])
    expect(artifacts.result.needs_review[0]?.reason).toBe("一级注册造价师证应以使用有效期为准，但 OCR 未识别到该字段")
  })
})
