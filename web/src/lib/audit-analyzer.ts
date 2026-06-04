import type { AuditResult, AuditRow, AuditSummary } from "./audit-types"
import { cleanEvidenceText } from "./evidence-text"
import { paddleOcrMarkdownPagesToOcrText, parsePaddleOcrJsonlMarkdown } from "./paddleocr"

type OcrPages = {
  pages: Map<number, string[]>
  errorPages: Map<number, string>
}

const DATE_CN = /(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g
const DATE_DOT = /(20\d{2})\s*[.。:\-]\s*(\d{1,2})\s*[.。:\-]\s*(\d{1,2})/g
const DATE_COMPACT_TAIL = /(20\d{2})\s*[.。:\-]\s*(\d{2})(\d{2})(?!\d)/g
const DATE_COMPACT = /(20\d{2})(\d{2})(\d{2})(?!\d)/g
const VALIDITY_MARKER =
  /有\s*(?:效|[A-Za-z]{1,3}|贿|B)\s*(?:期|限|FA)|有\s*效\s*贿\s*限|有\s*效\s*期\s*限|注册\s*有\s*效\s*期|有\s*效\s*期\s*至|效\s*期|效\s*期\s*限|有效期報|有效期燉/
const DOCUMENT_USE_VALIDITY_MARKER = /(?:使用|用|吏用|史用|更用)\s*有\s*效\s*期/
const PRIMARY_COST_CERTIFICATE_MARKER = /一级\s*(?:注册)?\s*造价\s*(?:(?:工程)?师)?\s*(?:注册)?\s*证/
const CERTIFICATE_PAGE_MARKER =
  /(?:证书|注册证|注册信息|资格证|职业资格|执业资格|注册执业|身份证|营业执照|许可证|资质证|一级\s*(?:注册)?\s*造价\s*(?:(?:工程)?师)?\s*(?:注册)?\s*证)/
const LOCAL_CERTIFICATE_CONTEXT_MARKER =
  /(?:中华人民共和国\s*一级\s*造价\s*工程师\s*注册\s*证书|注册\s*证书\s*信息\s*页|执业\s*注册\s*信息\s*截图|身份证|营业执照|许可证|资质证|资格证|职业资格|执业资格|注册执业|注册信息|注册证|证书信息|一级\s*(?:注册)?\s*造价\s*(?:(?:工程)?师)?\s*(?:注册)?\s*证)/
const NON_CERTIFICATE_FORM_MARKER = /(?:项目\s*评审\s*结论\s*表|评审\s*结论|审查\s*表|审核\s*表|汇总\s*表|结论\s*表)/
const FIELD_BOUNDARY = "\n"

type DateMatch = {
  start: number
  end: number
  value: Date
}

type ValidityMarkerMatch = {
  index: number
  length: number
}

type CandidateContext = {
  context: string
  focusOffset: number
}

export function analyzePaddleOcrJsonl(input: { jobId: string; cutoff: string; jsonl: string }): {
  result: AuditResult
  ocrText: string
  csv: string
} {
  const markdownPages = parsePaddleOcrJsonlMarkdown(input.jsonl)
  const ocrText = paddleOcrMarkdownPagesToOcrText(markdownPages)
  const pages = parseOcrText(ocrText)
  const analyzed = analyzeOcrPages(pages, input.cutoff)
  const result: AuditResult = {
    job_id: input.jobId,
    summary: analyzed.summary,
    matches: analyzed.matches,
    near_expiry: analyzed.near_expiry,
    needs_review: analyzed.needs_review,
    candidates: analyzed.candidates,
    ocr_errors: Array.from(pages.errorPages.entries()).map(([page, error]) => ({ page, error })),
  }
  return { result, ocrText, csv: resultToCsv(result.matches) }
}

function parseOcrText(text: string): OcrPages {
  const pages = new Map<number, string[]>()
  const errorPages = new Map<number, string>()
  let currentPage: number | null = null
  for (const line of text.split(/\r?\n/)) {
    const pageMatch = /^PAGE\t(\d+)\tLINES\t\d+/.exec(line)
    if (pageMatch) {
      currentPage = Number(pageMatch[1])
      pages.set(currentPage, [])
      continue
    }
    const errorMatch = /^PAGE\t(\d+)\tERROR\t(.+)/.exec(line)
    if (errorMatch) {
      errorPages.set(Number(errorMatch[1]), errorMatch[2] || "")
      currentPage = null
      continue
    }
    if (line.startsWith("PAGE_END\t")) {
      currentPage = null
      continue
    }
    if (currentPage !== null) {
      const lines = pages.get(currentPage) || []
      lines.push(line)
      pages.set(currentPage, lines)
    }
  }
  return { pages, errorPages }
}

function analyzeOcrPages(ocrPages: OcrPages, cutoff: string, nearDays = 45): {
  summary: AuditSummary
  matches: AuditRow[]
  near_expiry: AuditRow[]
  needs_review: AuditRow[]
  candidates: AuditRow[]
} {
  const cutoffDate = parseDate(cutoff)
  const nearUntil = addDays(cutoffDate, nearDays)
  const candidates: AuditRow[] = []
  const needsReview: AuditRow[] = []

  for (const [page, lines] of Array.from(ocrPages.pages.entries()).sort(([left], [right]) => left - right)) {
    const title = lines.find((line) => line.trim())?.trim() || ""
    const pageText = lines.join(" ")
    if (!isCertificatePage(pageText)) continue
    const shouldReviewMissingUseValidity =
      PRIMARY_COST_CERTIFICATE_MARKER.test(pageText) && !DOCUMENT_USE_VALIDITY_MARKER.test(pageText)

    lines.forEach((line, index) => {
      if (!VALIDITY_MARKER.test(line)) return
      const { context, focusOffset } = candidateContext(lines, index)
      if (/条形码|二维码|查验部门|核查网页|本条形码/.test(context)) return
      if (!isCertificateValidityContext(context, focusOffset)) return
      const fieldContext = validitySegment(context, focusOffset)
      const expiry = extractExpiryFromContext(context, focusOffset)
      const row: AuditRow = {
        page,
        title,
        context,
        field_context: fieldContext,
        expiry_date: expiry,
        items: [],
      }
      if (!expiry) {
        row.reason = "有效期字段存在但日期无法可靠解析"
        needsReview.push(row)
      } else {
        candidates.push(row)
      }
    })

    if (shouldReviewMissingUseValidity) {
      needsReview.push({
        page,
        title,
        context: pageText,
        field_context: "一级注册造价师证页未识别到使用有效期",
        expiry_date: null,
        items: [],
        reason: "一级注册造价师证应以使用有效期为准，但 OCR 未识别到该字段",
      })
    }
  }

  const matches: AuditRow[] = []
  const nearExpiry: AuditRow[] = []
  for (const row of candidates) {
    if (!row.expiry_date || row.expiry_date === "长期") continue
    const expiryDate = parseDate(row.expiry_date)
    if (expiryDate.getTime() < cutoffDate.getTime()) {
      matches.push(row)
    } else if (expiryDate.getTime() <= nearUntil.getTime()) {
      nearExpiry.push(row)
    }
  }

  const summary: AuditSummary = {
    pages_ocr: ocrPages.pages.size,
    ocr_error_pages: ocrPages.errorPages.size,
    ocr_total_pages: ocrPages.pages.size + ocrPages.errorPages.size,
    validity_candidates: candidates.length + needsReview.length,
    matches: matches.length,
    near_expiry: nearExpiry.length,
    needs_review: needsReview.length,
    cutoff,
  }

  return { summary, matches, near_expiry: nearExpiry, needs_review: needsReview, candidates }
}

function candidateContext(lines: string[], index: number): CandidateContext {
  const line = lines[index] || ""
  const lookahead = DOCUMENT_USE_VALIDITY_MARKER.test(line) ? 4 : 6
  const start = Math.max(0, index - 4)
  const contextLines = lines.slice(start, Math.min(lines.length, index + lookahead))
  const prefix = contextLines.slice(0, index - start).join(FIELD_BOUNDARY)
  const normalizedPrefix = prefix ? normalizeEvidenceForAnalysis(prefix) : ""
  return {
    context: contextLines.join(FIELD_BOUNDARY),
    focusOffset: normalizedPrefix ? normalizedPrefix.length + FIELD_BOUNDARY.length : 0,
  }
}

function extractExpiryFromContext(context: string, focusOffset = 0): string | null {
  const segment = validitySegment(context, focusOffset)
  if (segment.replace(/\s/g, "").includes("长期")) return "长期"
  const dates = findDateMatches(segment)
  if (dates.length === 0) return null
  const selected = shouldUseRangeEnd(segment, dates) ? dates[dates.length - 1] : dates[0]
  return selected ? formatDate(selected.value) : null
}

function validitySegment(context: string, focusOffset = 0): string {
  const normalized = normalizeEvidenceForAnalysis(context)
  const marker = findValidityMarker(normalized, focusOffset)
  if (!marker) return context
  const segment = normalized.slice(marker.index)
  const stops = [
    /\s中华人民共和国/,
    /\s一级\s*造价\s*工程师\s*注册\s*证书/,
    /\s证\s*书\s*编\s*号/,
    /\s(?:初始注册|延续注册|机构外变更|变更注册)/,
    /\s批准日期/,
    /\s签名日期/,
    /\s发证日期/,
    /\s证明日期/,
  ]
  let cut = segment.length
  for (const stopPattern of stops) {
    const stop = stopPattern.exec(segment)
    if (stop) cut = Math.min(cut, stop.index)
  }
  const nextMarker = findNextValidityMarkerIndex(segment, marker.length)
  if (nextMarker !== null) cut = Math.min(cut, nextMarker)

  const bounded = segment.slice(0, cut)
  return trimAfterFirstCompleteLine(bounded).trim()
}

function normalizeEvidenceForAnalysis(text: string): string {
  return cleanEvidenceText(text).replace(/\n{2,}/g, "\n")
}

function findValidityMarker(text: string, startIndex = 0): ValidityMarkerMatch | null {
  const searchable = text.slice(Math.max(0, startIndex))
  const useMarker = DOCUMENT_USE_VALIDITY_MARKER.exec(searchable)
  DOCUMENT_USE_VALIDITY_MARKER.lastIndex = 0
  const genericMarker = VALIDITY_MARKER.exec(searchable)
  VALIDITY_MARKER.lastIndex = 0
  if (useMarker && (!genericMarker || (useMarker.index ?? 0) <= (genericMarker.index ?? 0))) {
    return { index: Math.max(0, startIndex) + (useMarker.index ?? 0), length: useMarker[0]?.length ?? 0 }
  }
  if (!genericMarker) return null
  return { index: Math.max(0, startIndex) + (genericMarker.index ?? 0), length: genericMarker[0]?.length ?? 0 }
}

function findNextValidityMarkerIndex(segment: string, offset: number): number | null {
  const tail = segment.slice(offset)
  const next = findValidityMarker(tail)
  if (!next) return null
  return offset + next.index
}

function isCertificateValidityContext(context: string, focusOffset: number): boolean {
  const segment = localValidityClassificationSegment(context, focusOffset)
  const certificateIndex = lastMatchIndex(segment, LOCAL_CERTIFICATE_CONTEXT_MARKER)
  if (certificateIndex === null) return false
  const nonCertificateIndex = lastMatchIndex(segment, NON_CERTIFICATE_FORM_MARKER)
  return nonCertificateIndex === null || certificateIndex > nonCertificateIndex
}

function localValidityClassificationSegment(context: string, focusOffset: number): string {
  const normalized = normalizeEvidenceForAnalysis(context)
  const marker = findValidityMarker(normalized, focusOffset)
  if (!marker) return normalized
  const before = normalized.slice(0, marker.index)
  const beforeLines = before
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const beforeContext = beforeLines.slice(-4).join(FIELD_BOUNDARY)
  const afterContext = trimAtNextDocumentBoundary(normalized.slice(marker.index))
  return [beforeContext, afterContext].filter(Boolean).join(FIELD_BOUNDARY)
}

function trimAtNextDocumentBoundary(text: string): string {
  const boundaries = [
    /\n\s*中华人民共和国/,
    /\n\s*一级\s*造价\s*工程师\s*注册\s*证书/,
    /\n\s*#?\s*项目\s*评审\s*结论\s*表/,
  ]
  let cut = text.length
  for (const boundary of boundaries) {
    const match = boundary.exec(text)
    if (match) cut = Math.min(cut, match.index)
  }
  return text.slice(0, cut)
}

function lastMatchIndex(text: string, pattern: RegExp): number | null {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`
  const globalPattern = new RegExp(pattern.source, flags)
  let lastIndex: number | null = null
  for (const match of text.matchAll(globalPattern)) {
    lastIndex = match.index ?? 0
  }
  return lastIndex
}

function trimAfterFirstCompleteLine(segment: string): string {
  const lines = segment.split(/\n+/)
  const kept: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const value = line.trim()
    if (!value) continue
    kept.push(value)
    if (value.replace(/\s/g, "").includes("长期")) break
    if (findDateMatches(value).length > 0) {
      const nextValue = firstFollowingValue(lines.slice(index + 1))
      if (nextValue && isContinuationDateLine(nextValue)) {
        kept.push(nextValue)
      }
      break
    }
  }
  return kept.length > 0 ? kept.join(" ") : segment
}

function firstFollowingValue(lines: string[]): string | null {
  for (const line of lines) {
    const value = line.trim()
    if (value) return value
  }
  return null
}

function shouldUseRangeEnd(segment: string, dates: DateMatch[]): boolean {
  if (dates.length < 2) return false
  const first = dates[0]
  const last = dates[dates.length - 1]
  if (!first || !last) return false
  const between = segment.slice(first.end, last.start)
  return /(?:至|到|止|自|起|—|–|－|-|~|～)/.test(between) || isSplitUseValidityRange(segment, first, last)
}

function isSplitUseValidityRange(segment: string, first: DateMatch, last: DateMatch): boolean {
  const beforeFirst = segment.slice(0, first.start)
  const between = segment.slice(first.end, last.start)
  return DOCUMENT_USE_VALIDITY_MARKER.test(beforeFirst) && /^\s*(?:[·•●*+-]|[。．.])?\s*$/.test(between)
}

function isContinuationDateLine(value: string): boolean {
  return /^(?:[·•●*+-]|[。．.])?\s*(?:20\d{2}\s*年|20\d{2}\s*[.。:\-])/.test(value) && findDateMatches(value).length > 0
}

function isCertificatePage(pageText: string): boolean {
  return CERTIFICATE_PAGE_MARKER.test(pageText)
}

function findDateMatches(text: string): DateMatch[] {
  const normalized = text.replace(/(20\d{2}\s*[.。:\-]\s*\d{1,2})\s+(\d{1,2})(?!\d)/g, "$1.$2")
  const found: DateMatch[] = []
  for (const regex of [DATE_CN, DATE_DOT, DATE_COMPACT_TAIL, DATE_COMPACT]) {
    regex.lastIndex = 0
    for (const match of normalized.matchAll(regex)) {
      const start = match.index || 0
      const end = start + match[0].length
      if (found.some((item) => !(end <= item.start || start >= item.end))) continue
      const dt = safeDate(match[1] || "", match[2] || "", match[3] || "")
      if (dt) found.push({ start, end, value: dt })
    }
  }
  return found.sort((left, right) => left.start - right.start)
}

function safeDate(year: string, month: string, day: string): Date | null {
  const value = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (Number.isNaN(value.getTime())) return null
  if (value.getUTCFullYear() !== Number(year) || value.getUTCMonth() !== Number(month) - 1 || value.getUTCDate() !== Number(day)) {
    return null
  }
  return value
}

function parseDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`Invalid date: ${value}`)
  const parsed = safeDate(match[1] || "", match[2] || "", match[3] || "")
  if (!parsed) throw new Error(`Invalid date: ${value}`)
  return parsed
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000)
}

function formatDate(value: Date): string {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  const day = String(value.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function resultToCsv(rows: AuditRow[]): string {
  const header = "page,title,expiry_date,context"
  const body = rows.map((row) =>
    [row.page, row.title, row.expiry_date || "", row.context]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(","),
  )
  return `${[header, ...body].join("\n")}\n`
}
