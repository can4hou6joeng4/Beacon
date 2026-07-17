"use client"

import { LoaderCircle, User } from "lucide-react"
import { useMemo, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { HistoryScreen } from "@/components/audit/history-screen"
import { ProcessingScreen } from "@/components/audit/processing-screen"
import { ReportScreen } from "@/components/audit/report-screen"
import { SubmitScreen } from "@/components/audit/submit-screen"
import { UsersScreen } from "@/components/audit/users-screen"
import { cn } from "@/lib/utils"
import type { StageState } from "@/lib/audit-progress"
import type { AuditHistoryJob, AuditResult } from "@/lib/audit-types"
import type { PublicUser } from "@/lib/auth-types"
import type { PaddleOcrProviderProgress } from "@/lib/paddleocr"

type Screen = "submit" | "processing" | "report" | "history" | "users"

type StatusPayload = {
  job: AuditHistoryJob
  stage: StageState
  providerProgress?: PaddleOcrProviderProgress
  error?: string
}

type ResultPayload = {
  job: AuditHistoryJob
  result: AuditResult
  error?: string
}

type CreatePayload = {
  job: AuditHistoryJob
  error?: string
}

type ApiErrorPayload = {
  error?: string
  code?: string
}

type CloudUploadSessionPayload = {
  jobId: string
  objectKey: string
  uploadUrl: string
  uploadExpiresAt: string
  method: "PUT"
  headers: Record<string, string>
  uploadMode?: "r2-presigned" | "worker"
  error?: string
}

type MePayload = {
  user?: PublicUser
  error?: string
}

type ReportState = {
  job: AuditHistoryJob
  result: AuditResult
}

type VeilState = {
  title: string
  sub?: string
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

function uploadErrorMessage(payload: ApiErrorPayload | null, status: number, uploadMode: CloudUploadSessionPayload["uploadMode"]): string {
  if (uploadMode === "r2-presigned" && !payload?.error) {
    return `PDF 直传到云端存储失败：HTTP ${status}。请确认网络稳定后重试；如果持续失败，需要检查 R2 直传 CORS 或签名配置。`
  }
  if (payload?.code === "UPLOAD_SESSION_FAILED") {
    return "这次上传没有成功写入云端存储，上传额度已自动回退。请重新选择 PDF 再发起一次检查。"
  }
  if (payload?.code === "UPLOAD_ALREADY_SUBMITTED") {
    return "这个任务已经提交给 PaddleOCR 解析，不能重复上传 PDF。请查看当前任务进度或重新发起检查。"
  }
  if (payload?.code === "UPLOAD_SESSION_COMPLETED") {
    return "这个任务已经完成，不能再上传 PDF。请重新发起新的检查任务。"
  }
  if (payload?.code === "UPLOAD_SESSION_STALE") {
    return "这个上传会话已不可用，请重新选择 PDF 发起新的检查。"
  }
  return payload?.error || `对象存储上传失败：HTTP ${status}`
}

/**
 * Overall progress on the prototype's scale: staged client jumps (session 6,
 * PUT done 30, submit done 36), provider 38–85, analyze/persist 88/94,
 * complete 100.
 */
function overallPercent(stage: StageState | null, staged: number, provider: PaddleOcrProviderProgress | null): number {
  if (stage?.complete) return 100
  let percent = staged
  if (provider) {
    if (provider.state === "pending") percent = Math.max(percent, 38)
    if (provider.state === "running") {
      percent = Math.max(percent, provider.percent !== null ? 30 + Math.round(provider.percent * 0.55) : 40)
    }
    if (provider.state === "done" || provider.state === "failed") percent = Math.max(percent, 85)
  }
  if (stage && !stage.failed) {
    if (stage.activeStep >= 4) percent = Math.max(percent, 88)
    if (stage.activeStep >= 5) percent = Math.max(percent, 94)
  }
  return Math.max(0, Math.min(percent, 99))
}

function processingStatusText(stage: StageState | null, provider: PaddleOcrProviderProgress | null): string {
  if (stage?.complete) return "报告已生成"
  if (provider?.state === "running" && provider.extractedPages !== null && provider.totalPages !== null) {
    return `PaddleOCR 解析中 · 已解析 ${provider.extractedPages}/${provider.totalPages} 页`
  }
  if (provider?.state === "pending") return provider.message || "任务已提交，等待 PaddleOCR 分配算力"
  if (provider?.state === "done") return "OCR 完成，正在提取有效期并分类"
  return stage?.label || "正在处理"
}

function Topbar({
  screen,
  isAdmin,
  userName,
  hasLastReport,
  signingOut,
  onNav,
  onOpenLast,
  onSignOut,
}: {
  screen: Screen
  isAdmin: boolean
  userName: string
  hasLastReport: boolean
  signingOut: boolean
  onNav: (screen: Screen) => void
  onOpenLast: () => void
  onSignOut: () => void
}) {
  const links: Array<{ key: Screen; label: string }> = [
    { key: "submit", label: "新建检查" },
    { key: "history", label: "历史" },
  ]
  if (isAdmin) links.push({ key: "users", label: "用户管理" })

  return (
    <header className="sticky top-0 z-40 border-b border-hair bg-background">
      <div className="mx-auto flex h-15 max-w-[1128px] items-center justify-between gap-3 px-4 sm:gap-6 sm:px-6">
        <button type="button" className="inline-flex min-h-10 shrink-0 items-baseline gap-2.5 px-0.5" onClick={() => onNav("submit")}>
          <span className="whitespace-nowrap text-base font-bold tracking-[0.02em]">有效期检查</span>
          <span className="font-latin hidden text-[10px] font-medium tracking-[0.32em] text-faint sm:inline">EXPIRY AUDIT</span>
        </button>
        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <button
              key={link.key}
              type="button"
              className={cn(
                "inline-flex min-h-10 items-center px-2 text-sm transition-colors sm:px-3",
                screen === link.key
                  ? "text-primary underline decoration-[1.5px] underline-offset-[7px]"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onNav(link.key)}
            >
              {link.label}
            </button>
          ))}
          {hasLastReport ? (
            <button
              type="button"
              className={cn(
                "inline-flex min-h-10 items-center px-2 text-sm transition-colors sm:px-3",
                screen === "report"
                  ? "text-primary underline decoration-[1.5px] underline-offset-[7px]"
                  : "text-faint hover:text-foreground",
              )}
              onClick={onOpenLast}
            >
              上次报告
            </button>
          ) : null}
          <span className="ml-1 inline-flex items-center gap-2 border-l border-hair pl-2.5 text-[13.5px] text-muted-foreground sm:ml-3 sm:pl-4">
            <User className="size-3.5" />
            <span className="max-w-24 truncate sm:max-w-none">{userName}</span>
            <button
              type="button"
              className="inline-flex min-h-10 items-center px-2 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              disabled={signingOut}
              onClick={onSignOut}
            >
              {signingOut ? "退出中" : "退出"}
            </button>
          </span>
        </nav>
      </div>
    </header>
  )
}

function subscribeNever() {
  return () => undefined
}

function getLocalToday(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function ReportFlowApp({
  initialHistory,
  currentUser: initialUser,
  defaultCutoff,
}: {
  initialHistory: AuditHistoryJob[]
  currentUser: PublicUser
  defaultCutoff: string
}) {
  const [screen, setScreen] = useState<Screen>("submit")
  const [currentUser, setCurrentUser] = useState(initialUser)
  const [history, setHistory] = useState(initialHistory)

  const [file, setFile] = useState<File | null>(null)
  // Server-rendered HTML anchors dates to the server's UTC day (defaultCutoff);
  // after hydration this re-reads the browser's local day, which can differ
  // around midnight for UTC+8 users. The cutoff follows it until edited.
  const localToday = useSyncExternalStore(subscribeNever, getLocalToday, () => defaultCutoff)
  const [cutoffOverride, setCutoffOverride] = useState<string | null>(null)
  const cutoff = cutoffOverride ?? localToday
  const [dateTouched, setDateTouched] = useState(false)

  const [currentJob, setCurrentJob] = useState<AuditHistoryJob | null>(null)
  const [stage, setStage] = useState<StageState | null>(null)
  const [providerProgress, setProviderProgress] = useState<PaddleOcrProviderProgress | null>(null)
  const [stagedPercent, setStagedPercent] = useState(0)
  const [pipelineError, setPipelineError] = useState("")

  const [report, setReport] = useState<ReportState | null>(null)
  const [revealKey, setRevealKey] = useState(0)
  const [veil, setVeil] = useState<VeilState | null>(null)
  const [busyJobId, setBusyJobId] = useState<string | null>(null)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const generationRef = useRef(0)

  function bumpGeneration(): number {
    generationRef.current += 1
    return generationRef.current
  }

  function isStale(generation: number): boolean {
    return generation !== generationRef.current
  }

  const lastCompleteJob = useMemo(
    () =>
      history.find((job) => job.status === "complete" && job.runtime === "paddleocr" && Boolean(job.providerJobId)) ??
      null,
    [history],
  )

  async function refreshCurrentUser() {
    const response = await fetch("/api/auth/me", { cache: "no-store" })
    if (!response.ok) return
    const payload = (await response.json().catch(() => ({}))) as MePayload
    if (payload.user) setCurrentUser(payload.user)
  }

  async function refreshHistory() {
    const response = await fetch("/api/audit/history", { cache: "no-store" })
    if (!response.ok) return
    const payload = (await response.json().catch(() => null)) as { jobs?: AuditHistoryJob[] } | null
    if (payload?.jobs) setHistory(payload.jobs)
  }

  async function loadResult(job: AuditHistoryJob): Promise<ReportState | null> {
    if (job.runtime !== "paddleocr" || !job.providerJobId) return null
    try {
      const response = await fetch(`/api/audit/jobs/${job.id}/result`, { cache: "no-store" })
      const payload = (await response.json().catch(() => ({ error: "读取结果失败" }))) as ResultPayload
      if (!response.ok) {
        toast.error(response.status === 401 ? "请重新登录后读取历史结果" : payload.error || "读取结果失败")
        return null
      }
      const next = { job: payload.job, result: payload.result }
      setReport(next)
      await Promise.all([refreshHistory(), refreshCurrentUser()])
      return next
    } catch (fetchError) {
      toast.error(fetchError instanceof Error ? fetchError.message : "读取结果失败")
      return null
    }
  }

  async function pollStatus(job: AuditHistoryJob, generation: number) {
    if (isStale(generation)) return
    let payload: StatusPayload
    try {
      const response = await fetch(`/api/audit/jobs/${job.id}/status`, { cache: "no-store" })
      payload = (await response.json().catch(() => ({ error: "读取任务状态失败" }))) as StatusPayload
      if (!response.ok) {
        if (isStale(generation)) return
        setPipelineError(payload.error || "读取任务状态失败")
        setStage((previous) => ({
          activeStep: previous?.activeStep ?? 3,
          failed: true,
          complete: false,
          label: payload.error || "读取任务状态失败",
        }))
        return
      }
    } catch (fetchError) {
      if (isStale(generation)) return
      const message = fetchError instanceof Error ? fetchError.message : "读取任务状态失败"
      setPipelineError(message)
      setStage((previous) => ({
        activeStep: previous?.activeStep ?? 3,
        failed: true,
        complete: false,
        label: message,
      }))
      return
    }

    if (isStale(generation)) return
    setCurrentJob(payload.job)
    setStage(payload.stage)
    setProviderProgress(payload.providerProgress ?? null)

    if (payload.job.status === "complete") {
      setStagedPercent(100)
      const loaded = await loadResult(payload.job)
      if (isStale(generation)) return
      if (!loaded) {
        setPipelineError("报告已生成，但读取结果失败，请稍后在「历史」中重新打开")
        setStage({ activeStep: 5, failed: true, complete: false, label: "读取结果失败" })
        return
      }
      window.setTimeout(() => {
        if (isStale(generation)) return
        setScreen("report")
        setRevealKey((key) => key + 1)
        setFile(null)
        setDateTouched(false)
        toast.success("报告已生成")
      }, 900)
      return
    }

    if (payload.job.status === "failed") {
      setPipelineError(payload.job.message || "检查失败")
      await Promise.all([refreshHistory(), refreshCurrentUser()])
      return
    }

    window.setTimeout(() => {
      void pollStatus(payload.job, generation)
    }, 1500)
  }

  async function handleStart() {
    if (!file || !cutoff) return
    const generation = bumpGeneration()

    setPipelineError("")
    setProviderProgress(null)
    setStagedPercent(0)
    setStage({ activeStep: 1, failed: false, complete: false, label: "正在创建上传会话" })
    setScreen("processing")

    function failBackToSubmit(message: string) {
      if (isStale(generation)) return
      setScreen("submit")
      setStage(null)
      setProviderProgress(null)
      setStagedPercent(0)
      toast.error(message)
    }

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
        failBackToSubmit(session.error || "创建云端上传会话失败")
        return
      }
      if (isStale(generation)) return
      void Promise.all([refreshHistory(), refreshCurrentUser()])

      setStagedPercent(6)
      setStage({ activeStep: 1, failed: false, complete: false, label: "正在上传 PDF 到对象存储" })
      const uploadResponse = await fetch(session.uploadUrl, {
        method: session.method,
        headers: session.headers,
        body: file,
      })
      if (!uploadResponse.ok) {
        const uploadError = (await uploadResponse.json().catch(() => null)) as ApiErrorPayload | null
        void refreshHistory()
        failBackToSubmit(uploadErrorMessage(uploadError, uploadResponse.status, session.uploadMode))
        return
      }
      if (isStale(generation)) return

      setStagedPercent(30)
      setStage({ activeStep: 2, failed: false, complete: false, label: "正在提交 PaddleOCR 任务" })
      const submitResponse = await fetchWithRetries("/api/audit/cloud-uploads/paddleocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: session.jobId, objectKey: session.objectKey }),
      })
      const submitted = (await submitResponse.json().catch(() => ({ error: "提交 PaddleOCR 任务失败" }))) as CreatePayload
      if (!submitResponse.ok) {
        void refreshHistory()
        failBackToSubmit(submitted.error || "提交 PaddleOCR 任务失败")
        return
      }
      if (isStale(generation)) return

      setCurrentJob(submitted.job)
      setStagedPercent(36)
      setStage({ activeStep: 3, failed: false, complete: false, label: "等待 PaddleOCR 解析进度" })
      void Promise.all([refreshHistory(), refreshCurrentUser()])
      void pollStatus(submitted.job, generation)
    } catch (fetchError) {
      failBackToSubmit(fetchError instanceof Error ? `${fetchError.message}。上传中断时请重试。` : "上传请求中断，请重试")
    }
  }

  function exitProcessing(failed: boolean) {
    bumpGeneration()
    setScreen("submit")
    if (failed) {
      setStage(null)
      setProviderProgress(null)
      setStagedPercent(0)
      void Promise.all([refreshHistory(), refreshCurrentUser()])
      return
    }
    toast("已转入后台，可在「历史」中继续查看")
    void refreshHistory()
  }

  async function openCompleteJob(job: AuditHistoryJob) {
    if (busyJobId) return
    setBusyJobId(job.id)
    setVeil({ title: "正在读取报告…" })
    try {
      const loaded = await loadResult(job)
      if (loaded) {
        setRevealKey((key) => key + 1)
        setScreen("report")
      }
    } finally {
      setBusyJobId(null)
      setVeil(null)
    }
  }

  function openRunningJob(job: AuditHistoryJob) {
    const generation = bumpGeneration()
    setPipelineError("")
    setCurrentJob(job)
    setProviderProgress(null)
    setStagedPercent(36)
    setStage({
      activeStep: job.status === "queued" ? 1 : 3,
      failed: false,
      complete: false,
      label: job.message || "云端处理中",
    })
    setScreen("processing")
    void pollStatus(job, generation)
  }

  async function reanalyzeJob(job: AuditHistoryJob) {
    if (reanalyzing) return
    setReanalyzing(true)
    setBusyJobId(job.id)
    setVeil({ title: "正在按最新规则重算…", sub: "读取已保存的 OCR 结果，跳过重复识别" })
    const toastId = toast.loading("正在重新分析历史结果", { description: job.filename })
    try {
      const response = await fetch(`/api/audit/jobs/${job.id}/reanalyze`, { method: "POST", cache: "no-store" })
      const payload = (await response.json().catch(() => ({ error: "重新分析失败" }))) as ResultPayload
      if (!response.ok) {
        toast.error("重新分析失败", {
          id: toastId,
          description: response.status === 401 ? "请重新登录后重新分析历史结果" : payload.error || "重新分析失败",
        })
        return
      }
      setReport({ job: payload.job, result: payload.result })
      setRevealKey((key) => key + 1)
      setScreen("report")
      await Promise.all([refreshHistory(), refreshCurrentUser()])
      toast.success("已使用最新规则刷新结果", { id: toastId, description: payload.job.filename })
    } catch (fetchError) {
      toast.error("重新分析失败", {
        id: toastId,
        description: fetchError instanceof Error ? fetchError.message : "重新分析失败",
      })
    } finally {
      setReanalyzing(false)
      setBusyJobId(null)
      setVeil(null)
    }
  }

  function newAudit() {
    setFile(null)
    setDateTouched(false)
    setCutoffOverride(null)
    setScreen("submit")
  }

  function openLastReport() {
    if (report) {
      setScreen("report")
      return
    }
    if (lastCompleteJob) void openCompleteJob(lastCompleteJob)
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

  const processingFailed = Boolean(stage?.failed) || Boolean(pipelineError)

  return (
    <div className="min-h-screen">
      {screen !== "processing" ? (
        <Topbar
          screen={screen}
          isAdmin={currentUser.role === "admin"}
          userName={currentUser.name}
          hasLastReport={Boolean(report) || Boolean(lastCompleteJob)}
          signingOut={isSigningOut}
          onNav={setScreen}
          onOpenLast={openLastReport}
          onSignOut={handleSignOut}
        />
      ) : null}

      {screen === "submit" ? (
        <SubmitScreen
          currentUser={currentUser}
          file={file}
          onPickFile={setFile}
          onClearFile={() => setFile(null)}
          cutoff={cutoff}
          onCutoffChange={setCutoffOverride}
          dateTouched={dateTouched}
          onDateTouch={() => setDateTouched(true)}
          presetAnchor={localToday}
          onStart={() => void handleStart()}
        />
      ) : null}

      {screen === "processing" ? (
        <ProcessingScreen
          filename={currentJob?.filename || file?.name || ""}
          targetPercent={overallPercent(stage, stagedPercent, providerProgress)}
          statusText={processingStatusText(stage, providerProgress)}
          activeStep={stage?.activeStep ?? 1}
          done={Boolean(stage?.complete)}
          failed={processingFailed}
          failureMessage={pipelineError || currentJob?.message || "检查失败"}
          canExit={processingFailed || Boolean(currentJob?.providerJobId)}
          onExit={() => exitProcessing(processingFailed)}
        />
      ) : null}

      {screen === "report" && report ? (
        <ReportScreen
          key={`${report.job.id}:${revealKey}`}
          job={report.job}
          result={report.result}
          reanalyzing={reanalyzing}
          onReanalyze={() => void reanalyzeJob(report.job)}
          onNewAudit={newAudit}
        />
      ) : null}

      {screen === "report" && !report ? (
        <main className="mx-auto w-full max-w-3xl px-6 pt-18 pb-32 text-[13.5px] text-faint">暂无可展示的报告，请从「历史」中选择。</main>
      ) : null}

      {screen === "history" ? (
        <HistoryScreen
          jobs={history}
          busyJobId={busyJobId}
          onOpenComplete={(job) => void openCompleteJob(job)}
          onOpenRunning={openRunningJob}
          onReanalyze={(job) => void reanalyzeJob(job)}
        />
      ) : null}

      {screen === "users" && currentUser.role === "admin" ? <UsersScreen currentUser={currentUser} /> : null}

      {veil ? (
        <div
          className="fixed inset-0 z-80 flex flex-col items-center justify-center gap-3 px-6 text-center"
          style={{ background: "rgba(250, 250, 247, 0.9)" }}
          role="status"
        >
          <LoaderCircle className="size-5.5 animate-spin text-primary" />
          <div className="text-[17px] font-semibold">{veil.title}</div>
          {veil.sub ? <div className="text-[13.5px] text-muted-foreground">{veil.sub}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
