"use client"

import {
  AlertCircle,
  Archive,
  CalendarClock,
  ChevronDown,
  FileText,
  FolderOpen,
  LogOut,
  ShieldCheck,
  UploadCloud,
  User,
} from "lucide-react"
import { FormEvent, useMemo, useRef, useState } from "react"
import { AdminUserDialog } from "@/components/audit/admin-user-dialog"
import { HistoryPanel } from "@/components/audit/history-panel"
import { ProgressSteps } from "@/components/audit/progress-steps"
import { ResultDistributionChart } from "@/components/audit/result-distribution-chart"
import { ResultTable } from "@/components/audit/result-table"
import { ThemeToggle } from "@/components/theme-toggle"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import type { StageState } from "@/lib/audit-python"
import type { AuditHistoryJob, AuditResult, AuditSummary } from "@/lib/audit-types"
import type { PublicUser } from "@/lib/auth-types"
import type { PaddleOcrProviderProgress } from "@/lib/paddleocr"

type DistributionRow = {
  name: string
  value: number
  kind: "danger" | "warning" | "review" | "ok"
}

type StatusPayload = {
  job: AuditHistoryJob
  stage: StageState
  providerProgress?: PaddleOcrProviderProgress
  error?: string
}

type ResultPayload = {
  job: AuditHistoryJob
  result: AuditResult
  distribution: DistributionRow[]
  error?: string
}

type InitialResultPayload = Omit<ResultPayload, "error">

type CreatePayload = {
  job: AuditHistoryJob
  error?: string
}

type CloudUploadSessionPayload = {
  jobId: string
  objectKey: string
  uploadUrl: string
  uploadExpiresAt: string
  method: "PUT"
  headers: Record<string, string>
  error?: string
}

type MePayload = {
  user?: PublicUser
  error?: string
}

function emptyDistribution(): DistributionRow[] {
  return [
    { name: "早于截止", value: 0, kind: "danger" },
    { name: "临近到期", value: 0, kind: "warning" },
    { name: "需要复核", value: 0, kind: "review" },
    { name: "有效", value: 0, kind: "ok" },
  ]
}

function summaryValue(summary: AuditSummary | null, key: keyof AuditSummary): number {
  if (!summary) return 0
  return Number(summary[key] ?? 0)
}

function metricCardClass(label: string, value: number): string {
  if (label === "命中项" && value > 0) return "border-destructive/40 bg-destructive/5"
  if (label === "需复核" && value > 0) return "border-[#176b87]/40 bg-[#eef7fa] dark:bg-cyan-950/30 dark:border-cyan-800/60"
  return ""
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (value >= 1024 * 1024) return `${Math.round(value / 1024 / 1024)} MB`
  if (value >= 1024) return `${Math.round(value / 1024)} KB`
  return `${value} B`
}

function quotaPercent(used: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

async function fetchWithRetries(input: RequestInfo | URL, init: RequestInit, attempts = 5): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(input, init)
      if (response.ok || response.status < 500 || attempt === attempts) return response
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
      if (attempt === attempts) throw error
    }
    await new Promise((resolve) => window.setTimeout(resolve, Math.min(800 * attempt, 3200)))
  }
  throw lastError instanceof Error ? lastError : new Error("请求失败")
}

function CollapseButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-expanded={open} onClick={onClick}>
      <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      <span className="sr-only">{open ? "收起" : "展开"}</span>
    </Button>
  )
}

export function AuditCommandCenter({
  initialHistory,
  initialResult,
  currentUser: initialUser,
}: {
  initialHistory: AuditHistoryJob[]
  initialResult: InitialResultPayload | null
  currentUser: PublicUser
}) {
  const [currentUser, setCurrentUser] = useState(initialUser)
  const [history, setHistory] = useState(initialHistory)
  const [currentJob, setCurrentJob] = useState<AuditHistoryJob | null>(initialResult?.job ?? initialHistory[0] ?? null)
  const [stage, setStage] = useState<StageState | null>(
    initialResult ? { activeStep: 5, failed: false, complete: true, label: initialResult.job.message } : null,
  )
  const [providerProgress, setProviderProgress] = useState<PaddleOcrProviderProgress | null>(null)
  const [result, setResult] = useState<AuditResult | null>(initialResult?.result ?? null)
  const [distribution, setDistribution] = useState<DistributionRow[]>(initialResult?.distribution ?? emptyDistribution)
  const [error, setError] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [loadingResultJobId, setLoadingResultJobId] = useState<string | null>(null)
  const [reanalyzingJobId, setReanalyzingJobId] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(!currentJob)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [fileName, setFileName] = useState("")
  const [cutoff, setCutoff] = useState("2026-05-07")
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const summary = result?.summary ?? null
  const progressPercent = uploadPercent > 0 && uploadPercent < 100
    ? uploadPercent
    : stage?.complete
      ? 100
      : stage
        ? Math.min(stage.activeStep * 20, 86)
        : 0
  const headline = useMemo(() => {
    if (!result) return currentJob ? currentJob.message : "上传 PDF 后开始检查"
    return result.summary.matches === 0 ? "当前任务无早于截止日期证件" : `发现 ${result.summary.matches} 项早于截止日期`
  }, [currentJob, result])

  async function refreshCurrentUser() {
    const response = await fetch("/api/auth/me", { cache: "no-store" })
    if (!response.ok) return
    const payload = (await response.json().catch(() => ({}))) as MePayload
    if (payload.user) setCurrentUser(payload.user)
  }

  async function refreshHistory() {
    const response = await fetch("/api/audit/history", { cache: "no-store" })
    if (!response.ok) return
    const payload = (await response.json()) as { jobs: AuditHistoryJob[] }
    setHistory(payload.jobs)
  }

  async function loadResult(job: AuditHistoryJob) {
    if (job.runtime !== "paddleocr" && !job.pythonJobId) return
    setError("")
    setLoadingResultJobId(job.id)
    try {
      const response = await fetch(`/api/audit/jobs/${job.id}/result`, { cache: "no-store" })
      const payload = (await response.json().catch(() => ({ error: "读取结果失败" }))) as ResultPayload
      if (!response.ok) {
        setError(response.status === 401 ? "请重新登录后读取历史结果" : payload.error || "读取结果失败")
        return
      }
      setCurrentJob(payload.job)
      setResult(payload.result)
      setDistribution(payload.distribution)
      setStage({ activeStep: 5, failed: false, complete: true, label: payload.job.message })
      setProviderProgress(null)
      await Promise.all([refreshHistory(), refreshCurrentUser()])
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "读取结果失败")
    } finally {
      setLoadingResultJobId(null)
    }
  }

  async function reanalyzeHistoryJob(job: AuditHistoryJob) {
    setError("")
    setReanalyzingJobId(job.id)
    try {
      const response = await fetch(`/api/audit/jobs/${job.id}/reanalyze`, {
        method: "POST",
        cache: "no-store",
      })
      const payload = (await response.json().catch(() => ({ error: "重新分析失败" }))) as ResultPayload
      if (!response.ok) {
        setError(response.status === 401 ? "请重新登录后重新分析历史结果" : payload.error || "重新分析失败")
        return
      }
      setCurrentJob(payload.job)
      setResult(payload.result)
      setDistribution(payload.distribution)
      setStage({ activeStep: 5, failed: false, complete: true, label: payload.job.message })
      setProviderProgress(null)
      setUploadPercent(100)
      await Promise.all([refreshHistory(), refreshCurrentUser()])
      setHistoryOpen(false)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "重新分析失败")
    } finally {
      setReanalyzingJobId(null)
    }
  }

  async function pollStatus(job: AuditHistoryJob) {
    const response = await fetch(`/api/audit/jobs/${job.id}/status`, { cache: "no-store" })
    const payload = (await response.json().catch(() => ({ error: "读取任务状态失败" }))) as StatusPayload
    if (!response.ok) {
      setError(payload.error || "读取任务状态失败")
      setIsUploading(false)
      return
    }

    setCurrentJob(payload.job)
    setStage(payload.stage)
    setProviderProgress(payload.providerProgress ?? null)

    if (payload.job.status === "complete") {
      setUploadPercent(100)
      await loadResult(payload.job)
      setIsUploading(false)
      return
    }

    if (payload.job.status === "failed") {
      setUploadPercent(0)
      setError(payload.job.message || "检查失败")
      setIsUploading(false)
      await Promise.all([refreshHistory(), refreshCurrentUser()])
      return
    }

    window.setTimeout(() => pollStatus(payload.job), 1500)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError("请先选择 PDF 文件")
      return
    }

    setError("")
    setResult(null)
    setDistribution(emptyDistribution())
    setIsUploading(true)
    setUploadPercent(0)
    setProviderProgress(null)
    setStage({ activeStep: 1, failed: false, complete: false, label: "正在创建上传会话" })

    try {
      const sessionResponse = await fetchWithRetries("/api/audit/cloud-uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          size: file.size,
          contentType: file.type || "application/pdf",
          cutoff,
        }),
      })
      const session = (await sessionResponse.json().catch(() => ({ error: "创建云端上传会话失败" }))) as CloudUploadSessionPayload
      if (!sessionResponse.ok) {
        setError(session.error || "创建云端上传会话失败")
        setIsUploading(false)
        setProviderProgress(null)
        setStage({ activeStep: 1, failed: true, complete: false, label: "上传失败" })
        return
      }
      await Promise.all([refreshHistory(), refreshCurrentUser()])

      setStage({ activeStep: 1, failed: false, complete: false, label: "正在上传 PDF 到对象存储" })
      const uploadResponse = await fetchWithRetries(session.uploadUrl, {
        method: session.method,
        headers: session.headers,
        body: file,
      })
      if (!uploadResponse.ok) {
        const uploadError = (await uploadResponse.json().catch(() => null)) as { error?: string } | null
        setError(uploadError?.error || `对象存储上传失败：HTTP ${uploadResponse.status}`)
        setIsUploading(false)
        setProviderProgress(null)
        setStage({ activeStep: 1, failed: true, complete: false, label: "上传失败" })
        return
      }

      setUploadPercent(86)
      setStage({ activeStep: 2, failed: false, complete: false, label: "正在提交 PaddleOCR 任务" })
      const submitResponse = await fetchWithRetries("/api/audit/cloud-uploads/paddleocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: session.jobId, objectKey: session.objectKey }),
      })
      const submitted = (await submitResponse.json().catch(() => ({ error: "提交 PaddleOCR 任务失败" }))) as CreatePayload
      if (!submitResponse.ok) {
        setError(submitted.error || "提交 PaddleOCR 任务失败")
        setIsUploading(false)
        setProviderProgress(null)
        setStage({ activeStep: 2, failed: true, complete: false, label: "提交失败" })
        return
      }

      setCurrentJob(submitted.job)
      await Promise.all([refreshHistory(), refreshCurrentUser()])
      void pollStatus(submitted.job)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? `${fetchError.message}。上传中断时请重试。` : "上传请求中断，请重试")
      setIsUploading(false)
      setProviderProgress(null)
      setStage({ activeStep: 1, failed: true, complete: false, label: "上传失败" })
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
      window.location.reload()
    } finally {
      setIsSigningOut(false)
    }
  }

  function openHistoryJob(job: AuditHistoryJob) {
    setCurrentJob(job)
    if (job.status === "complete") {
      setUploadPercent(100)
      setStage({ activeStep: 5, failed: false, complete: true, label: job.message })
      setProviderProgress(null)
      void loadResult(job)
      return
    }
    setResult(null)
    setDistribution(emptyDistribution())
    setUploadPercent(0)
    setProviderProgress(null)
    setStage(
      job.status === "failed"
        ? { activeStep: 3, failed: true, complete: false, label: job.message }
        : { activeStep: 3, failed: false, complete: false, label: job.message },
    )
    if (job.status !== "failed" && job.providerJobId) void pollStatus(job)
  }

  return (
    <main className="audit-shell min-h-screen bg-[#f3f6f8] text-foreground dark:bg-background">
      <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-r bg-[#edf4f7] p-5 dark:bg-muted/20">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-[#176b87] text-sm font-black text-white">PDF</div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">证件有效期审计</h1>
              <p className="text-xs text-muted-foreground">Cloudflare / R2 / PaddleOCR</p>
            </div>
          </div>

          <CurrentUserCard currentUser={currentUser} isSigningOut={isSigningOut} onSignOut={handleSignOut} />

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-sm">上传与条件</CardTitle>
                  <CollapseButton open={uploadOpen} onClick={() => setUploadOpen((open) => !open)} />
                </div>
              </CardHeader>
              {uploadOpen ? (
                <CardContent className="space-y-4">
                  <Label
                    htmlFor="pdf"
                    className="grid min-h-36 cursor-pointer place-items-center rounded-lg border border-dashed bg-background p-5 text-center dark:bg-background/60"
                  >
                    <div>
                      <UploadCloud className="mx-auto mb-3 h-8 w-8 text-[#176b87]" />
                      <div className="font-semibold">选择或拖入 PDF</div>
                      <div className="mt-1 max-w-64 truncate text-xs text-muted-foreground">
                        {fileName || "PDF 上传到 R2 后进入 PaddleOCR 队列"}
                      </div>
                    </div>
                    <Input
                      ref={fileInputRef}
                      id="pdf"
                      name="pdf"
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(event) => setFileName(event.target.files?.[0]?.name || "")}
                    />
                  </Label>
                  <div className="space-y-2">
                    <Label htmlFor="cutoff">筛选截止日期</Label>
                    <Input id="cutoff" type="date" value={cutoff} onChange={(event) => setCutoff(event.target.value)} required />
                  </div>
                  <Button className="w-full bg-[#176b87] hover:bg-[#145d75]" type="submit" disabled={isUploading}>
                    {isUploading ? "检查中" : "开始检查"}
                  </Button>
                </CardContent>
              ) : null}
            </Card>
          </form>

        </aside>

        <section className="min-w-0 p-5">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-normal text-muted-foreground">Audit Console</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-normal">{headline}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {result
                  ? `截止日期 ${result.summary.cutoff}，共识别 ${result.summary.validity_candidates} 个有效期字段。`
                  : "结果会按早于截止日期、临近到期、需要复核和全部候选分层展示。"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {currentUser.role === "admin" ? <AdminUserDialog currentUser={currentUser} /> : null}
              <ThemeToggle />
              <Button variant="outline" className="h-9" onClick={() => setHistoryOpen(true)}>
                <Archive className="h-4 w-4" />
                历史
                <Badge variant="secondary" className="ml-1">
                  {history.length}
                </Badge>
              </Button>
            </div>
          </div>

          {error ? (
            <Alert variant="destructive" className="mb-5">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>检查失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Card className="mx-auto mb-5 max-w-6xl overflow-hidden">
            <CardHeader>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm">任务流水线</CardTitle>
                    <Badge variant="outline">{progressPercent}%</Badge>
                  </div>
                  {currentJob ? (
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#176b87]" />
                        <span className="max-w-full truncate">{currentJob.filename}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5" />
                        截止 {currentJob.cutoff}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="max-w-2xl text-xs leading-5 text-muted-foreground xl:text-right">
                  {stage?.complete ? "报告已生成" : stage?.label || currentJob?.message || "等待上传 PDF 后开始云端处理"}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ProgressSteps stage={stage} providerProgress={providerProgress} />
            </CardContent>
          </Card>

          <Card className="mb-5">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-sm">审计概览</CardTitle>
                <CollapseButton open={overviewOpen} onClick={() => setOverviewOpen((open) => !open)} />
              </div>
            </CardHeader>
            {overviewOpen ? (
              <CardContent className="space-y-5">
                <div className="grid gap-3 md:grid-cols-5">
                  {[
                    ["PDF 页数", result?.manifest?.page_count ?? summaryValue(summary, "pages_ocr")],
                    ["证件页", result?.manifest?.certificate_pages ?? 0],
                    ["OCR 成功", summaryValue(summary, "pages_ocr")],
                    ["OCR 失败", summary?.ocr_error_pages ?? 0],
                    ["有效期字段", summaryValue(summary, "validity_candidates")],
                    ["命中项", summaryValue(summary, "matches")],
                    ["需复核", summaryValue(summary, "needs_review")],
                  ].map(([label, value]) => (
                    <Card key={label} className={metricCardClass(String(label), Number(value))}>
                      <CardContent className="p-4">
                        <div className="text-xs font-semibold text-muted-foreground">{label}</div>
                        <div className="mt-2 text-2xl font-semibold">{value}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {currentJob ? (
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="rounded-md border bg-background p-4 dark:bg-card">
                      <div className="text-xs font-semibold text-muted-foreground">当前任务</div>
                      <div className="mt-2 flex min-w-0 items-center gap-2 text-sm font-semibold">
                        <FileText className="h-4 w-4 shrink-0 text-[#176b87]" />
                        <span className="truncate">{currentJob.filename}</span>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">{currentJob.message}</div>
                    </div>
                    <div className="rounded-md border bg-background p-4 dark:bg-card">
                      <div className="text-xs font-semibold text-muted-foreground">任务状态</div>
                      <div className="mt-2 text-2xl font-semibold">{progressPercent}%</div>
                      <div className="mt-1 text-xs text-muted-foreground">{stage?.complete ? "已完成" : stage?.label || currentJob.status}</div>
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <CardTitle className="text-sm">结果分布</CardTitle>
                    <Badge variant="outline">Recharts</Badge>
                  </div>
                  <ResultDistributionChart data={distribution} />
                </div>
              </CardContent>
            ) : null}
          </Card>

          <ResultTable result={result} />
        </section>

        <HistoryPanel
          open={historyOpen}
          jobs={history}
          activeJobId={currentJob?.id ?? null}
          loadingJobId={loadingResultJobId}
          reanalyzingJobId={reanalyzingJobId}
          onOpenChange={setHistoryOpen}
          onOpen={openHistoryJob}
          onReanalyze={reanalyzeHistoryJob}
        />
      </div>

      <Separator />
      <footer className="flex items-center justify-center gap-2 bg-background px-4 py-3 text-xs text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        Cloudflare Worker 负责会话、D1 历史、R2 对象与 PaddleOCR 编排。
      </footer>
    </main>
  )
}

function CurrentUserCard({
  currentUser,
  isSigningOut,
  onSignOut,
}: {
  currentUser: PublicUser
  isSigningOut: boolean
  onSignOut: () => void
}) {
  const uploadUsed = currentUser.quota.usage.uploadBytes
  const uploadLimit = currentUser.quota.quota.uploadBytesLimit
  const jobsUsed = currentUser.quota.usage.ocrJobs
  const jobsLimit = currentUser.quota.quota.ocrJobsLimit
  const pagesUsed = currentUser.quota.usage.ocrPages
  const pagesLimit = currentUser.quota.quota.ocrPagesLimit

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <User className="h-4 w-4 shrink-0 text-[#176b87]" />
              <CardTitle className="truncate text-sm">{currentUser.name}</CardTitle>
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{currentUser.username}</div>
          </div>
          <Badge variant={currentUser.role === "admin" ? "secondary" : "outline"} className="shrink-0">
            {currentUser.role === "admin" ? <ShieldCheck className="h-3 w-3" /> : null}
            {currentUser.role === "admin" ? "admin" : "user"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <QuotaLine label="上传" usedLabel={formatBytes(uploadUsed)} limitLabel={formatBytes(uploadLimit)} percent={quotaPercent(uploadUsed, uploadLimit)} />
        <QuotaLine label="OCR 任务" usedLabel={String(jobsUsed)} limitLabel={String(jobsLimit)} percent={quotaPercent(jobsUsed, jobsLimit)} />
        <QuotaLine label="OCR 页数" usedLabel={String(pagesUsed)} limitLabel={String(pagesLimit)} percent={quotaPercent(pagesUsed, pagesLimit)} />
        <Button type="button" variant="outline" className="w-full" onClick={onSignOut} disabled={isSigningOut}>
          <LogOut className="h-4 w-4" />
          {isSigningOut ? "退出中" : "退出登录"}
        </Button>
      </CardContent>
    </Card>
  )
}

function QuotaLine({
  label,
  usedLabel,
  limitLabel,
  percent,
}: {
  label: string
  usedLabel: string
  limitLabel: string
  percent: number
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          {usedLabel}/{limitLabel}
        </span>
      </div>
      <Progress value={percent} />
    </div>
  )
}
