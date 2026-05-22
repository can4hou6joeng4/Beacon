import { describe, expect, it } from "vitest"
import {
  buildPaddleOcrUrlJobRequest,
  createPaddleOcrConfig,
  fetchPaddleOcrJobSnapshot,
  paddleOcrMarkdownPagesToOcrText,
  parsePaddleOcrJobId,
  parsePaddleOcrJobSnapshot,
  parsePaddleOcrJsonlMarkdown,
  submitPaddleOcrUrlJob,
} from "../paddleocr"

describe("createPaddleOcrConfig", () => {
  it("uses safe defaults and reads secrets from environment input", () => {
    const config = createPaddleOcrConfig({
      PADDLEOCR_API_BASE_URL: "https://paddleocr.aistudio-app.com/api/v2/ocr/",
      PADDLEOCR_API_TOKEN: "runtime-secret",
      PADDLEOCR_MODEL: "PaddleOCR-VL-1.5",
      PADDLEOCR_POLL_INTERVAL_MS: "7000",
      PADDLEOCR_USE_DOC_ORIENTATION_CLASSIFY: "true",
    })

    expect(config).toEqual({
      apiBaseUrl: "https://paddleocr.aistudio-app.com/api/v2/ocr",
      apiToken: "runtime-secret",
      model: "PaddleOCR-VL-1.5",
      pollIntervalMs: 7000,
      optionalPayload: {
        useDocOrientationClassify: true,
        useDocUnwarping: false,
        useChartRecognition: false,
      },
    })
  })
})

describe("buildPaddleOcrUrlJobRequest", () => {
  it("creates the URL-mode PaddleOCR job request", () => {
    const config = createPaddleOcrConfig({ PADDLEOCR_API_TOKEN: "runtime-secret" })

    expect(buildPaddleOcrUrlJobRequest({ fileUrl: "https://files.example.com/input.pdf", config })).toEqual({
      url: "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs",
      headers: {
        Authorization: "bearer runtime-secret",
        "Content-Type": "application/json",
      },
      body: {
        fileUrl: "https://files.example.com/input.pdf",
        model: "PaddleOCR-VL-1.5",
        optionalPayload: {
          useDocOrientationClassify: false,
          useDocUnwarping: false,
          useChartRecognition: false,
        },
      },
    })
  })

  it("rejects non-http URL mode inputs", () => {
    const config = createPaddleOcrConfig({ PADDLEOCR_API_TOKEN: "runtime-secret" })
    expect(() => buildPaddleOcrUrlJobRequest({ fileUrl: "file:///tmp/input.pdf", config })).toThrow(
      "PaddleOCR URL mode requires an HTTP(S) file URL",
    )
  })
})

describe("PaddleOCR HTTP client", () => {
  it("submits URL-mode jobs without exposing the token in the response", async () => {
    const config = createPaddleOcrConfig({ PADDLEOCR_API_TOKEN: "runtime-secret" })
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return Response.json({ data: { jobId: "job-123" } })
    }

    await expect(
      submitPaddleOcrUrlJob({ fileUrl: "https://files.example.com/input.pdf", config, fetcher }),
    ).resolves.toEqual({ providerJobId: "job-123" })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.init?.headers).toEqual({
      Authorization: "bearer runtime-secret",
      "Content-Type": "application/json",
    })
  })

  it("fetches and normalizes job snapshots", async () => {
    const config = createPaddleOcrConfig({ PADDLEOCR_API_TOKEN: "runtime-secret" })
    const fetcher = async () =>
      Response.json({
        data: {
          state: "running",
          extractProgress: { totalPages: 5, extractedPages: 2 },
        },
      })

    await expect(fetchPaddleOcrJobSnapshot({ providerJobId: "job-123", config, fetcher })).resolves.toMatchObject({
      providerState: "running",
      status: "running",
      message: "PaddleOCR 正在解析：2/5 页",
    })
  })
})

describe("PaddleOCR response parsing", () => {
  it("extracts job ids from submit responses", () => {
    expect(parsePaddleOcrJobId({ data: { jobId: "job-123" } })).toBe("job-123")
  })

  it("maps running status with progress", () => {
    expect(
      parsePaddleOcrJobSnapshot({
        data: {
          jobId: "job-123",
          state: "running",
          extractProgress: { totalPages: 225, extractedPages: 17 },
        },
      }),
    ).toMatchObject({
      providerJobId: "job-123",
      providerState: "running",
      status: "running",
      message: "PaddleOCR 正在解析：17/225 页",
      totalPages: 225,
      extractedPages: 17,
    })
  })

  it("maps completed status with jsonl result url", () => {
    expect(
      parsePaddleOcrJobSnapshot({
        data: {
          jobId: "job-123",
          state: "done",
          extractProgress: { extractedPages: 225, startTime: "2026-05-22T01:00:00Z", endTime: "2026-05-22T01:03:00Z" },
          resultUrl: { jsonUrl: "https://files.example.com/result.jsonl" },
        },
      }),
    ).toMatchObject({
      providerState: "done",
      status: "complete",
      message: "PaddleOCR 解析完成",
      extractedPages: 225,
      jsonUrl: "https://files.example.com/result.jsonl",
      startTime: "2026-05-22T01:00:00Z",
      endTime: "2026-05-22T01:03:00Z",
    })
  })

  it("maps failed status with provider error message", () => {
    expect(parsePaddleOcrJobSnapshot({ data: { state: "failed", errorMsg: "file expired" } })).toMatchObject({
      providerState: "failed",
      status: "failed",
      message: "file expired",
      errorMessage: "file expired",
    })
  })
})

describe("PaddleOCR JSONL markdown normalization", () => {
  it("extracts markdown pages and converts them to ocr.txt blocks", () => {
    const jsonl = [
      JSON.stringify({
        result: {
          layoutParsingResults: [
            { markdown: { text: "姓名：张三\n有效期至：2026-08-01" } },
            { markdown: { text: "身份证\n长期" } },
          ],
        },
      }),
      "",
    ].join("\n")

    const pages = parsePaddleOcrJsonlMarkdown(jsonl)
    expect(pages).toEqual([
      { pageIndex: 0, markdown: "姓名：张三\n有效期至：2026-08-01" },
      { pageIndex: 1, markdown: "身份证\n长期" },
    ])
    expect(paddleOcrMarkdownPagesToOcrText(pages)).toBe(
      [
        "PAGE\t1\tLINES\t2\tSOURCE\tpaddleocr",
        "姓名：张三",
        "有效期至：2026-08-01",
        "PAGE_END\t1",
        "PAGE\t2\tLINES\t2\tSOURCE\tpaddleocr",
        "身份证",
        "长期",
        "PAGE_END\t2",
        "",
      ].join("\n"),
    )
  })
})
