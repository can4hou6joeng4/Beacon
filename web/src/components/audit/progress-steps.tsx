import { CheckCircle2, Circle, Clock3, FileSearch, Loader2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StageState } from "@/lib/audit-python"
import type { PaddleOcrProviderProgress } from "@/lib/paddleocr"

const steps = [
  { label: "上传", description: "PDF 已进入云端队列" },
  { label: "书签解析", description: "读取目录结构与证件页范围" },
  { label: "OCR 识别", description: "逐页识别证件有效期文本" },
  { label: "有效期抽取", description: "提取日期并按截止日分类" },
  { label: "报告生成", description: "写入结果、历史与下载文件" },
]

function stepState(stage: StageState | null, stepNo: number) {
  if (!stage) return "waiting"
  if (stage.complete) return "done"
  if (stage.failed && stage.activeStep === stepNo) return "failed"
  if (stage.activeStep === stepNo) return "active"
  if (stage.activeStep > stepNo) return "done"
  return "waiting"
}

function providerStateLabel(progress: PaddleOcrProviderProgress): string {
  if (progress.state === "pending") return "排队中"
  if (progress.state === "running") return "解析中"
  if (progress.state === "done") return "已完成"
  return "失败"
}

function providerPageLabel(progress: PaddleOcrProviderProgress): string {
  if (progress.totalPages !== null && progress.extractedPages !== null) {
    return `${progress.extractedPages} / ${progress.totalPages} 页`
  }
  if (progress.state === "done" && progress.extractedPages !== null) {
    return `已解析 ${progress.extractedPages} 页`
  }
  return "等待页数进度"
}

function providerProgressLabel(progress: PaddleOcrProviderProgress): string {
  if (progress.percent !== null) return `${progress.percent}%`
  if (progress.state === "pending") return "等待"
  if (progress.state === "failed") return "失败"
  return "同步中"
}

function ProviderProgressPanel({ progress }: { progress: PaddleOcrProviderProgress }) {
  const hasPercent = progress.percent !== null
  const isRunning = progress.state === "running"
  const isFailed = progress.state === "failed"
  const isDone = progress.state === "done"
  const width = hasPercent ? progress.percent : isRunning ? 42 : isDone ? 100 : 18

  return (
    <div
      className={cn(
        "rounded-md border bg-background p-3",
        isRunning && "border-[#176b87]/30 bg-[#f4fbfd] dark:border-cyan-800/60 dark:bg-cyan-950/20",
        isDone && "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/70 dark:bg-emerald-950/20",
        isFailed && "border-destructive/40 bg-destructive/5",
      )}
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <FileSearch className={cn("h-4 w-4", isFailed ? "text-destructive" : "text-[#176b87]")} />
              第三方解析进度
            </span>
            <span className="rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">PaddleOCR</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                isFailed && "bg-destructive/10 text-destructive",
                isDone && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
                !isFailed && !isDone && "bg-[#e7f4f8] text-[#176b87] dark:bg-cyan-950 dark:text-cyan-200",
              )}
            >
              {providerStateLabel(progress)}
            </span>
          </div>
          <div className="mt-2 break-words text-xs leading-5 text-muted-foreground">{progress.message}</div>
        </div>
        <div className="shrink-0 text-left md:text-right">
          <div className="text-sm font-semibold">{providerPageLabel(progress)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{providerProgressLabel(progress)}</div>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-full bg-muted/70 p-1">
        <div
          className={cn(
            "h-2 rounded-full transition-[width] duration-700 ease-out",
            isFailed && "bg-destructive",
            isDone && "bg-emerald-600",
            !isFailed && !isDone && "bg-[#176b87]",
            !hasPercent && isRunning && "animate-pulse",
          )}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  )
}

export function ProgressSteps({
  stage,
  providerProgress,
  overallPercent,
}: {
  stage: StageState | null
  providerProgress?: PaddleOcrProviderProgress | null
  overallPercent?: number
}) {
  const activeStep = stage?.activeStep ?? 0
  const percent = overallPercent ?? (stage?.complete ? 100 : stage ? Math.min(stage.activeStep * 20, 86) : 0)
  const isRunning = activeStep > 0 && !stage?.complete && !stage?.failed

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-full bg-muted/60 p-1">
        <div
          className={cn(
            "h-2 rounded-full bg-[#176b87] transition-[width] duration-700 ease-out",
            isRunning && "animate-pulse",
            stage?.failed && "bg-destructive",
            stage?.complete && "bg-emerald-600",
          )}
          style={{ width: `${percent}%` }}
        />
        {isRunning ? <div className="absolute inset-y-1 left-0 w-24 animate-[pipeline-flow_1.8s_linear_infinite] rounded-full bg-white/35" /> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {steps.map((step, index) => {
          const stepNo = index + 1
          const state = stepState(stage, stepNo)
          return (
            <div
              key={step.label}
              className={cn(
                "group relative grid min-h-[124px] gap-3 rounded-md border bg-background p-3 text-center transition-all duration-300",
                "before:absolute before:left-1/2 before:top-5 before:hidden before:h-px before:w-[calc(100%+0.75rem)] before:bg-border md:before:block",
                index === steps.length - 1 && "before:hidden md:before:hidden",
                state === "active" && "scale-[1.01] border-[#176b87]/45 bg-[#eef7fa] shadow-sm dark:bg-cyan-950/30 dark:border-cyan-800/60",
                state === "failed" && "border-destructive/40 bg-destructive/5",
                state === "done" && "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/70 dark:bg-emerald-950/20",
              )}
            >
              <div className="relative z-10 mx-auto grid h-10 w-10 place-items-center rounded-full border bg-background shadow-sm">
                {state === "failed" ? (
                  <XCircle className="h-5 w-5 text-destructive" />
                ) : state === "done" ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-700" />
                ) : state === "active" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-[#176b87]" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/70" />
                )}
                {state === "active" ? (
                  <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-[#176b87]/20" aria-hidden="true" />
                ) : null}
              </div>
              <div className="min-w-0">
                <div className={cn("text-sm font-semibold", state === "active" && "text-[#176b87]", state === "failed" && "text-destructive")}>
                  {step.label}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {state === "active" ? "进行中" : state === "done" ? "完成" : state === "failed" ? "失败" : "等待"}
                </div>
                <div className="mt-2 text-xs leading-5 text-muted-foreground">
                  {state === "active" ? stage?.label || step.description : step.description}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between rounded-md bg-[#f6f8f9] px-3 py-2 text-xs text-muted-foreground dark:bg-muted/30">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" />
          {stage?.complete ? "报告已生成" : activeStep > 0 ? stage?.label || "处理中" : "等待上传"}
        </span>
        <span>{percent}%</span>
      </div>

      {providerProgress ? <ProviderProgressPanel progress={providerProgress} /> : null}
    </div>
  )
}
