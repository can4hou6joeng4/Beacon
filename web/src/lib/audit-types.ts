export type AuditStatusValue = "queued" | "running" | "complete" | "failed" | "unknown"

export type AuditJobStatus = {
  status: AuditStatusValue
  message?: string
  summary?: AuditSummary
  stderr?: string
}

export type AuditSummary = {
  pages_ocr: number
  ocr_error_pages?: number
  ocr_total_pages?: number
  validity_candidates: number
  matches: number
  near_expiry: number
  needs_review: number
  cutoff: string
}

export type AuditManifestSummary = {
  page_count: number
  outline_count: number
  certificate_items: number
  certificate_pages: number
}

export type AuditRowItem = {
  person_index?: number
  person?: string
  bookmark?: string
  start_page?: number
  end_page?: number
}

export type AuditRow = {
  page: number
  title: string
  context: string
  field_context: string
  expiry_date?: string | null
  reason?: string
  items?: AuditRowItem[]
}

export type AuditResult = {
  job_id: string
  summary: AuditSummary
  manifest?: AuditManifestSummary
  ocr_errors?: Array<{ page: number; error: string }>
  matches: AuditRow[]
  near_expiry: AuditRow[]
  needs_review: AuditRow[]
  candidates: AuditRow[]
}

export type AuditHistoryJob = {
  id: string
  userId: string | null
  pythonJobId: string | null
  providerJobId: string | null
  objectKey: string | null
  /**
   * `local-python` is retained only for historical rows and retired endpoint
   * compatibility. New jobs are created as `paddleocr`.
   */
  runtime: "local-python" | "paddleocr"
  filename: string
  cutoff: string
  status: AuditStatusValue
  message: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
  pagesOcr: number
  ocrErrorPages: number
  ocrTotalPages: number
  certificatePages: number
  validityCandidates: number
  matches: number
  nearExpiry: number
  needsReview: number
  uploadBytes: number
  ocrPagesUsed: number
}
