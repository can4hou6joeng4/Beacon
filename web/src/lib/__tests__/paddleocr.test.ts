import { describe, expect, it } from "vitest"
import {
  buildPaddleOcrFileJobRequest,
  buildPaddleOcrUrlJobRequest,
  createPaddleOcrConfig,
  fetchPaddleOcrJobSnapshot,
  paddleOcrMarkdownPagesToOcrText,
  parsePaddleOcrJobId,
  parsePaddleOcrJobSnapshot,
  parsePaddleOcrJsonlMarkdown,
  submitPaddleOcrFileJob,
  submitPaddleOcrUrlJob,
  toPaddleOcrProviderProgress,
} from "../paddleocr"

describe("createPaddleOcrConfig", () => {
  it("defaults to PaddleOCR-VL-1.6 when no model override is configured", () => {
    const config = createPaddleOcrConfig({ PADDLEOCR_API_TOKEN: "runtime-secret" })

    expect(config.model).toBe("PaddleOCR-VL-1.6")
  })

  it("uses safe defaults and reads secrets from environment input", () => {
    const config = createPaddleOcrConfig({
      PADDLEOCR_API_BASE_URL: "https://paddleocr.aistudio-app.com/api/v2/ocr/",
      PADDLEOCR_API_TOKEN: " bearer runtime-secret ",
      PADDLEOCR_MODEL: "PaddleOCR-VL-1.6",
      PADDLEOCR_POLL_INTERVAL_MS: "7000",
      PADDLEOCR_USE_DOC_ORIENTATION_CLASSIFY: "true",
    })

    expect(config).toEqual({
      apiBaseUrl: "https://paddleocr.aistudio-app.com/api/v2/ocr",
      apiToken: "runtime-secret",
      model: "PaddleOCR-VL-1.6",
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
        model: "PaddleOCR-VL-1.6",
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

describe("buildPaddleOcrFileJobRequest", () => {
  it("creates the multipart file-mode PaddleOCR job request", async () => {
    const config = createPaddleOcrConfig({ PADDLEOCR_API_TOKEN: "runtime-secret" })
    const request = buildPaddleOcrFileJobRequest({
      file: new Blob(["pdf-bytes"], { type: "application/pdf" }),
      filename: "input.pdf",
      config,
    })

    expect(request.url).toBe("https://paddleocr.aistudio-app.com/api/v2/ocr/jobs")
    expect(request.headers).toEqual({ Authorization: "bearer runtime-secret" })
    expect(request.body.get("model")).toBe("PaddleOCR-VL-1.6")
    expect(request.body.get("optionalPayload")).toBe(
      JSON.stringify({
        useDocOrientationClassify: false,
        useDocUnwarping: false,
        useChartRecognition: false,
      }),
    )
    const file = request.body.get("file")
    expect(file).toBeInstanceOf(File)
    expect((file as File).name).toBe("input.pdf")
    await expect((file as File).text()).resolves.toBe("pdf-bytes")
  })

  it("rejects empty file-mode inputs", () => {
    const config = createPaddleOcrConfig({ PADDLEOCR_API_TOKEN: "runtime-secret" })
    expect(() => buildPaddleOcrFileJobRequest({ file: new Blob([]), filename: "input.pdf", config })).toThrow(
      "PaddleOCR file mode requires a non-empty file",
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

  it("submits file-mode jobs without setting a manual multipart content type", async () => {
    const config = createPaddleOcrConfig({ PADDLEOCR_API_TOKEN: "runtime-secret" })
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return Response.json({ data: { jobId: "file-job-123" } })
    }

    await expect(
      submitPaddleOcrFileJob({
        file: new Blob(["pdf-bytes"], { type: "application/pdf" }),
        filename: "input.pdf",
        config,
        fetcher,
      }),
    ).resolves.toEqual({ providerJobId: "file-job-123" })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.init?.headers).toEqual({ Authorization: "bearer runtime-secret" })
    expect(calls[0]?.init?.body).toBeInstanceOf(FormData)
  })

  it("maps provider 401 responses to an actionable app error", async () => {
    const config = createPaddleOcrConfig({ PADDLEOCR_API_TOKEN: "runtime-secret" })
    const fetcher = async () => Response.json({ msg: "Unauthorized" }, { status: 401 })

    await expect(
      submitPaddleOcrFileJob({
        file: new Blob(["pdf-bytes"], { type: "application/pdf" }),
        filename: "input.pdf",
        config,
        fetcher,
      }),
    ).rejects.toMatchObject({
      status: 502,
      code: "PADDLEOCR_UNAUTHORIZED",
      message: "PaddleOCR 鉴权失败：PADDLEOCR_API_TOKEN 无效、过期或未授权当前接口",
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

  it("maps pending status to a queued audit status", () => {
    expect(
      parsePaddleOcrJobSnapshot({
        data: {
          jobId: "job-123",
          state: "pending",
        },
      }),
    ).toMatchObject({
      providerJobId: "job-123",
      providerState: "pending",
      status: "queued",
      message: "PaddleOCR 任务已创建，等待处理",
    })
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

describe("PaddleOCR provider progress", () => {
  it("maps page counts to a UI-safe percent", () => {
    const snapshot = parsePaddleOcrJobSnapshot({
      data: {
        jobId: "job-123",
        state: "running",
        extractProgress: { totalPages: 225, extractedPages: 17, startTime: "2026-05-22T01:00:00Z" },
      },
    })

    expect(toPaddleOcrProviderProgress(snapshot)).toEqual({
      provider: "paddleocr",
      state: "running",
      totalPages: 225,
      extractedPages: 17,
      percent: 8,
      startedAt: "2026-05-22T01:00:00Z",
      endedAt: null,
      message: "PaddleOCR 正在解析：17/225 页",
    })
  })

  it("does not invent a percent when PaddleOCR has not returned page counts", () => {
    const snapshot = parsePaddleOcrJobSnapshot({
      data: {
        jobId: "job-123",
        state: "running",
      },
    })

    expect(toPaddleOcrProviderProgress(snapshot)).toMatchObject({
      state: "running",
      totalPages: null,
      extractedPages: null,
      percent: null,
      message: "PaddleOCR 正在解析",
    })
  })

  it("marks completed provider progress as 100 percent when totals are unavailable", () => {
    const snapshot = parsePaddleOcrJobSnapshot({
      data: {
        jobId: "job-123",
        state: "done",
        extractProgress: { extractedPages: 225, endTime: "2026-05-22T01:03:00Z" },
      },
    })

    expect(toPaddleOcrProviderProgress(snapshot)).toMatchObject({
      state: "done",
      extractedPages: 225,
      percent: 100,
      endedAt: "2026-05-22T01:03:00Z",
      message: "PaddleOCR 解析完成",
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

  it("preserves audit-relevant text that PaddleOCR excludes from markdown as header content", () => {
    const jsonl = JSON.stringify({
      result: {
        layoutParsingResults: [
          {
            prunedResult: {
              model_settings: {
                markdown_ignore_labels: ["header", "number"],
              },
              parsing_res_list: [
                {
                  block_label: "header",
                  block_content: "一级注册造价师证（安装）",
                  block_bbox: [449, 146, 729, 173],
                },
                {
                  block_label: "header",
                  block_content: "使用有效期：2026年03月24日\n-2026年06月22日",
                  block_bbox: [256, 346, 470, 383],
                },
                {
                  block_label: "number",
                  block_content: "141",
                  block_bbox: [578, 1597, 613, 1616],
                },
              ],
            },
            markdown: {
              text: [
                "# 中华人民共和国 一级造价工程师注册证书",
                "姓 名：陈思羽",
                "证书编号：建[造]14254400038715",
                "有效期：2025年07月07日-2029年07月06日",
              ].join("\n"),
            },
          },
        ],
      },
    })

    const pages = parsePaddleOcrJsonlMarkdown(jsonl)
    expect(pages).toEqual([
      {
        pageIndex: 0,
        markdown: [
          "一级注册造价师证（安装）",
          "使用有效期：2026年03月24日\n-2026年06月22日",
          [
            "# 中华人民共和国 一级造价工程师注册证书",
            "姓 名：陈思羽",
            "证书编号：建[造]14254400038715",
            "有效期：2025年07月07日-2029年07月06日",
          ].join("\n"),
        ].join("\n\n"),
      },
    ])
    expect(paddleOcrMarkdownPagesToOcrText(pages)).toContain("使用有效期：2026年03月24日")
    expect(paddleOcrMarkdownPagesToOcrText(pages)).toContain("-2026年06月22日")
    expect(paddleOcrMarkdownPagesToOcrText(pages)).not.toContain("141")
  })
})
