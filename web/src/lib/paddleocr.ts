import type { AuditStatusValue } from "./audit-types"
import { AppError } from "./app-error"

export type PaddleOcrState = "pending" | "running" | "done" | "failed"

export type PaddleOcrOptionalPayload = {
  useDocOrientationClassify: boolean
  useDocUnwarping: boolean
  useChartRecognition: boolean
}

export type PaddleOcrConfig = {
  apiBaseUrl: string
  apiToken: string
  model: string
  pollIntervalMs: number
  optionalPayload: PaddleOcrOptionalPayload
}

export type PaddleOcrJobSnapshot = {
  providerJobId: string | null
  providerState: PaddleOcrState
  status: AuditStatusValue
  message: string
  totalPages: number | null
  extractedPages: number | null
  jsonUrl: string | null
  errorMessage: string | null
  startTime: string | null
  endTime: string | null
}

export type PaddleOcrProviderProgress = {
  provider: "paddleocr"
  state: PaddleOcrState
  totalPages: number | null
  extractedPages: number | null
  percent: number | null
  startedAt: string | null
  endedAt: string | null
  message: string
}

export type PaddleOcrMarkdownPage = {
  pageIndex: number
  markdown: string
}

type Fetcher = typeof fetch

const DEFAULT_API_BASE_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr"
const DEFAULT_MODEL = "PaddleOCR-VL-1.5"
const DEFAULT_POLL_INTERVAL_MS = 5000

type Env = Record<string, string | undefined>

export function createPaddleOcrConfig(env: Env = process.env): PaddleOcrConfig {
  return {
    apiBaseUrl: normalizeBaseUrl(env.PADDLEOCR_API_BASE_URL || DEFAULT_API_BASE_URL),
    apiToken: normalizeApiToken(env.PADDLEOCR_API_TOKEN || ""),
    model: env.PADDLEOCR_MODEL || DEFAULT_MODEL,
    pollIntervalMs: parsePositiveInt(env.PADDLEOCR_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS),
    optionalPayload: {
      useDocOrientationClassify: parseBoolean(env.PADDLEOCR_USE_DOC_ORIENTATION_CLASSIFY, false),
      useDocUnwarping: parseBoolean(env.PADDLEOCR_USE_DOC_UNWARPING, false),
      useChartRecognition: parseBoolean(env.PADDLEOCR_USE_CHART_RECOGNITION, false),
    },
  }
}

export function buildPaddleOcrUrlJobRequest(input: { fileUrl: string; config: PaddleOcrConfig }) {
  assertPaddleOcrToken(input.config)
  if (!input.fileUrl.startsWith("http://") && !input.fileUrl.startsWith("https://")) {
    throw new Error("PaddleOCR URL mode requires an HTTP(S) file URL")
  }
  return {
    url: `${input.config.apiBaseUrl}/jobs`,
    headers: {
      Authorization: `bearer ${input.config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: {
      fileUrl: input.fileUrl,
      model: input.config.model,
      optionalPayload: input.config.optionalPayload,
    },
  }
}

export function buildPaddleOcrFileJobRequest(input: {
  file: Blob
  filename: string
  config: PaddleOcrConfig
}): { url: string; headers: Record<string, string>; body: FormData } {
  assertPaddleOcrToken(input.config)
  if (input.file.size < 1) {
    throw new Error("PaddleOCR file mode requires a non-empty file")
  }
  const body = new FormData()
  const file = input.file.type ? input.file : new Blob([input.file], { type: "application/pdf" })
  body.append("file", file, input.filename)
  body.append("model", input.config.model)
  body.append("optionalPayload", JSON.stringify(input.config.optionalPayload))
  return {
    url: `${input.config.apiBaseUrl}/jobs`,
    headers: {
      Authorization: `bearer ${input.config.apiToken}`,
    },
    body,
  }
}

export async function submitPaddleOcrUrlJob(input: {
  fileUrl: string
  config?: PaddleOcrConfig
  fetcher?: Fetcher
}): Promise<{ providerJobId: string }> {
  const config = input.config ?? createPaddleOcrConfig()
  const request = buildPaddleOcrUrlJobRequest({ fileUrl: input.fileUrl, config })
  const fetcher = input.fetcher ?? fetch
  const response = await fetcher(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(request.body),
  })
  const payload = await readResponseJson(response, "PaddleOCR job submission failed")
  return { providerJobId: parsePaddleOcrJobId(payload) }
}

export async function submitPaddleOcrFileJob(input: {
  file: Blob
  filename: string
  config?: PaddleOcrConfig
  fetcher?: Fetcher
}): Promise<{ providerJobId: string }> {
  const config = input.config ?? createPaddleOcrConfig()
  const request = buildPaddleOcrFileJobRequest({ file: input.file, filename: input.filename, config })
  const fetcher = input.fetcher ?? fetch
  const response = await fetcher(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
  })
  const payload = await readResponseJson(response, "PaddleOCR file job submission failed")
  return { providerJobId: parsePaddleOcrJobId(payload) }
}

export async function fetchPaddleOcrJobSnapshot(input: {
  providerJobId: string
  config?: PaddleOcrConfig
  fetcher?: Fetcher
}): Promise<PaddleOcrJobSnapshot> {
  if (!input.providerJobId) throw new Error("PaddleOCR job id is required")
  const config = input.config ?? createPaddleOcrConfig()
  assertPaddleOcrToken(config)
  const fetcher = input.fetcher ?? fetch
  const response = await fetcher(`${config.apiBaseUrl}/jobs/${encodeURIComponent(input.providerJobId)}`, {
    method: "GET",
    headers: { Authorization: `bearer ${config.apiToken}` },
  })
  const payload = await readResponseJson(response, "PaddleOCR status request failed")
  return parsePaddleOcrJobSnapshot(payload)
}

export async function fetchText(url: string, fetcher: Fetcher = fetch): Promise<string> {
  const response = await fetcher(url, { method: "GET" })
  if (!response.ok) {
    throw new Error(`Text fetch failed: ${response.status}`)
  }
  return response.text()
}

export function paddleOcrStateToAuditStatus(state: PaddleOcrState): AuditStatusValue {
  if (state === "pending") return "queued"
  if (state === "running") return "running"
  if (state === "done") return "complete"
  return "failed"
}

export function parsePaddleOcrJobId(payload: unknown): string {
  const data = readObject(readObject(payload).data)
  const jobId = data.jobId
  if (typeof jobId !== "string" || !jobId) {
    throw new Error("PaddleOCR job response did not include data.jobId")
  }
  return jobId
}

export function parsePaddleOcrJobSnapshot(payload: unknown): PaddleOcrJobSnapshot {
  const data = readObject(readObject(payload).data)
  const state = parsePaddleOcrState(data.state)
  const progress = isRecord(data.extractProgress) ? data.extractProgress : {}
  const resultUrl = isRecord(data.resultUrl) ? data.resultUrl : {}
  const totalPages = readNullableNumber(progress.totalPages)
  const extractedPages = readNullableNumber(progress.extractedPages)
  const errorMessage = typeof data.errorMsg === "string" ? data.errorMsg : null
  const jsonUrl = typeof resultUrl.jsonUrl === "string" ? resultUrl.jsonUrl : null

  return {
    providerJobId: typeof data.jobId === "string" ? data.jobId : null,
    providerState: state,
    status: paddleOcrStateToAuditStatus(state),
    message: buildStatusMessage(state, totalPages, extractedPages, errorMessage),
    totalPages,
    extractedPages,
    jsonUrl,
    errorMessage,
    startTime: typeof progress.startTime === "string" ? progress.startTime : null,
    endTime: typeof progress.endTime === "string" ? progress.endTime : null,
  }
}

export function toPaddleOcrProviderProgress(snapshot: PaddleOcrJobSnapshot): PaddleOcrProviderProgress {
  return {
    provider: "paddleocr",
    state: snapshot.providerState,
    totalPages: snapshot.totalPages,
    extractedPages: snapshot.extractedPages,
    percent: calculateProviderPercent(snapshot),
    startedAt: snapshot.startTime,
    endedAt: snapshot.endTime,
    message: snapshot.message,
  }
}

export function parsePaddleOcrJsonlMarkdown(jsonl: string): PaddleOcrMarkdownPage[] {
  const pages: PaddleOcrMarkdownPage[] = []
  for (const line of jsonl.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const payload = JSON.parse(trimmed) as unknown
    const result = readObject(readObject(payload).result)
    const layoutParsingResults = result.layoutParsingResults
    if (!Array.isArray(layoutParsingResults)) continue
    for (const item of layoutParsingResults) {
      if (!isRecord(item)) continue
      const markdown = isRecord(item.markdown) ? item.markdown : {}
      if (typeof markdown.text !== "string") continue
      pages.push({ pageIndex: pages.length, markdown: markdown.text })
    }
  }
  return pages
}

export function paddleOcrMarkdownPagesToOcrText(pages: PaddleOcrMarkdownPage[]): string {
  const blocks = pages.map((page) => {
    const pageNo = page.pageIndex + 1
    const lines = page.markdown
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    return [
      `PAGE\t${pageNo}\tLINES\t${lines.length}\tSOURCE\tpaddleocr`,
      ...lines.map((line) => line.replace(/\t/g, " ")),
      `PAGE_END\t${pageNo}`,
    ].join("\n")
  })
  return `${blocks.join("\n")}${blocks.length > 0 ? "\n" : ""}`
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "")
}

function normalizeApiToken(value: string): string {
  return value.trim().replace(/^bearer\s+/i, "").trim()
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback
  if (value === "true") return true
  if (value === "false") return false
  return fallback
}

function assertPaddleOcrToken(config: PaddleOcrConfig): void {
  if (!config.apiToken) {
    throw new Error("PADDLEOCR_API_TOKEN is required")
  }
}

async function readResponseJson(response: Response, fallbackMessage: string): Promise<unknown> {
  const payload = (await response.json().catch(() => null)) as unknown
  if (!response.ok) {
    if (response.status === 401) {
      throw new AppError("PaddleOCR 鉴权失败：PADDLEOCR_API_TOKEN 无效、过期或未授权当前接口", {
        status: 502,
        code: "PADDLEOCR_UNAUTHORIZED",
      })
    }
    const data = isRecord(payload) ? payload : {}
    const message = typeof data.message === "string" ? data.message : fallbackMessage
    throw new Error(`${message}: ${response.status}`)
  }
  return payload
}

function buildStatusMessage(
  state: PaddleOcrState,
  totalPages: number | null,
  extractedPages: number | null,
  errorMessage: string | null,
): string {
  if (state === "pending") return "PaddleOCR 任务已创建，等待处理"
  if (state === "running" && totalPages !== null && extractedPages !== null) {
    return `PaddleOCR 正在解析：${extractedPages}/${totalPages} 页`
  }
  if (state === "running") return "PaddleOCR 正在解析"
  if (state === "done") return "PaddleOCR 解析完成"
  return errorMessage || "PaddleOCR 解析失败"
}

function calculateProviderPercent(snapshot: PaddleOcrJobSnapshot): number | null {
  if (snapshot.totalPages !== null && snapshot.totalPages > 0 && snapshot.extractedPages !== null) {
    const percent = Math.round((snapshot.extractedPages / snapshot.totalPages) * 100)
    return Math.min(100, Math.max(0, percent))
  }
  if (snapshot.providerState === "done") return 100
  return null
}

function parsePaddleOcrState(value: unknown): PaddleOcrState {
  if (value === "pending" || value === "running" || value === "done" || value === "failed") {
    return value
  }
  throw new Error("PaddleOCR status response included an unknown state")
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function readObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Expected object payload")
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
