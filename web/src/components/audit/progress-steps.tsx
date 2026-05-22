import { CheckCircle2, Circle, Clock3, Loader2, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StageState } from "@/lib/audit-python"

const steps = [
  { label: "上传", description: "PDF 已进入本机任务队列" },
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

export function ProgressSteps({ stage }: { stage: StageState | null }) {
  const activeStep = stage?.activeStep ?? 0
  const percent = stage?.complete ? 100 : stage ? Math.min(stage.activeStep * 20, 86) : 0

  return (
    <div className="space-y-2">
      {steps.map((step, index) => {
        const stepNo = index + 1
        const state = stepState(stage, stepNo)
        return (
          <div
            key={step.label}
            className={cn(
              "grid min-h-[68px] grid-cols-[28px_1fr] gap-3 rounded-md border bg-background p-3",
              state === "active" && "border-[#176b87]/45 bg-[#eef7fa] dark:bg-cyan-950/30 dark:border-cyan-800/60",
              state === "failed" && "border-destructive/40 bg-destructive/5",
              state === "done" && "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/70 dark:bg-emerald-950/20",
            )}
          >
            <div className="pt-0.5">
              {state === "failed" ? (
                <XCircle className="h-5 w-5 text-destructive" />
              ) : state === "done" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              ) : state === "active" ? (
                <Loader2 className="h-5 w-5 animate-spin text-[#176b87]" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/70" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className={cn("text-sm font-semibold", state === "active" && "text-[#176b87]", state === "failed" && "text-destructive")}>{step.label}</div>
                <div className="shrink-0 text-[11px] text-muted-foreground">
                  {state === "active" ? "进行中" : state === "done" ? "完成" : state === "failed" ? "失败" : "等待"}
                </div>
              </div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                {state === "active" ? stage?.label || step.description : step.description}
              </div>
            </div>
          </div>
        )
      })}
      <div className="flex items-center justify-between rounded-md bg-[#f6f8f9] px-3 py-2 text-xs text-muted-foreground dark:bg-muted/30">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" />
          {stage?.complete ? "报告已生成" : activeStep > 0 ? stage?.label || "处理中" : "等待上传"}
        </span>
        <span>{percent}%</span>
      </div>
    </div>
  )
}
