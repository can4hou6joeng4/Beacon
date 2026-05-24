"use client"

import { Archive, CheckCircle2, Clock3, FileClock, FolderOpen, Loader2, RefreshCw, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { AuditHistoryJob, AuditStatusValue } from "@/lib/audit-types"

type HistoryGroup = {
  key: string
  title: string
  icon: typeof Clock3
  jobs: AuditHistoryJob[]
}

function statusMeta(status: AuditStatusValue) {
  if (status === "complete") return { label: "已完成", icon: CheckCircle2, className: "text-emerald-700", badge: "secondary" as const }
  if (status === "failed") return { label: "失败", icon: XCircle, className: "text-destructive", badge: "destructive" as const }
  if (status === "running") return { label: "运行中", icon: Loader2, className: "text-[#176b87]", badge: "outline" as const }
  return { label: "等待中", icon: Clock3, className: "text-muted-foreground", badge: "outline" as const }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function groupJobs(jobs: AuditHistoryJob[]): HistoryGroup[] {
  return [
    { key: "active", title: "运行中", icon: Loader2, jobs: jobs.filter((job) => job.status === "queued" || job.status === "running") },
    { key: "complete", title: "已归档", icon: Archive, jobs: jobs.filter((job) => job.status === "complete") },
    { key: "failed", title: "异常", icon: XCircle, jobs: jobs.filter((job) => job.status === "failed" || job.status === "unknown") },
  ].filter((group) => group.jobs.length > 0)
}

function JobRow({
  job,
  active,
  loading,
  reanalyzing,
  onOpen,
  onReanalyze,
}: {
  job: AuditHistoryJob
  active: boolean
  loading: boolean
  reanalyzing: boolean
  onOpen: (job: AuditHistoryJob) => void
  onReanalyze: (job: AuditHistoryJob) => void
}) {
  const status = statusMeta(job.status)
  const StatusIcon = status.icon
  const canOpen = Boolean(job.pythonJobId || job.providerJobId)
  const canReanalyze = job.status === "complete" && job.runtime === "paddleocr" && Boolean(job.objectKey)
  const busy = loading || reanalyzing

  return (
    <article
      className={cn(
        "rounded-md border bg-background p-3 transition hover:border-[#176b87]/50 hover:bg-[#f6fbfd] dark:hover:bg-muted/40",
        active && "border-[#176b87] bg-[#eef7fa] shadow-sm dark:bg-cyan-950/30 dark:border-cyan-800/70",
        busy && "opacity-75",
      )}
    >
      <button
        type="button"
        className="w-full rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed"
        disabled={!canOpen || busy}
        onClick={() => onOpen(job)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <FolderOpen className="h-4 w-4 shrink-0 text-[#176b87]" />
              <div className="truncate text-sm font-semibold">{job.filename}</div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{formatDate(job.createdAt)} · 截止 {job.cutoff}</div>
          </div>
          <Badge variant={status.badge} className="shrink-0">
            {reanalyzing ? "分析中" : loading ? "读取中" : active ? "当前" : status.label}
          </Badge>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className={cn("rounded-md border px-2 py-1.5", job.matches > 0 ? "border-destructive/35 bg-destructive/5 text-destructive" : "bg-muted/40")}>
            <div className="font-semibold">{job.matches}</div>
            <div className="text-muted-foreground">命中</div>
          </div>
          <div className={cn("rounded-md border px-2 py-1.5", job.needsReview > 0 ? "border-[#176b87]/35 bg-[#eef7fa] text-[#176b87] dark:bg-cyan-950/30 dark:border-cyan-800/60" : "bg-muted/40")}>
            <div className="font-semibold">{job.needsReview}</div>
            <div className="text-muted-foreground">复核</div>
          </div>
          <div className="rounded-md border bg-muted/40 px-2 py-1.5">
            <div className="font-semibold">{job.pagesOcr || job.ocrTotalPages || 0}</div>
            <div className="text-muted-foreground">OCR 页</div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <StatusIcon className={cn("h-3.5 w-3.5", status.className, job.status === "running" && "animate-spin")} />
          <span className="truncate">{job.message}</span>
          {job.ocrErrorPages > 0 ? (
            <>
              <span>·</span>
              <FileClock className="h-3.5 w-3.5 text-destructive" />
              <span className="text-destructive">OCR 失败 {job.ocrErrorPages}</span>
            </>
          ) : null}
        </div>
      </button>

      {canReanalyze ? (
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => onReanalyze(job)}
          >
            {reanalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {reanalyzing ? "重新分析中" : "重新分析"}
          </Button>
        </div>
      ) : null}
    </article>
  )
}

export function HistoryPanel({
  open,
  jobs,
  activeJobId,
  loadingJobId,
  reanalyzingJobId,
  onOpenChange,
  onOpen,
  onReanalyze,
}: {
  open: boolean
  jobs: AuditHistoryJob[]
  activeJobId: string | null
  loadingJobId: string | null
  reanalyzingJobId: string | null
  onOpenChange: (open: boolean) => void
  onOpen: (job: AuditHistoryJob) => void
  onReanalyze: (job: AuditHistoryJob) => void
}) {
  const groups = groupJobs(jobs)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[440px] gap-0 bg-[#f7fafb] p-0 sm:max-w-[440px] dark:bg-background">
        <SheetHeader className="border-b bg-background p-5">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div>
              <SheetTitle>历史抽屉</SheetTitle>
              <SheetDescription>按任务状态收纳审计记录</SheetDescription>
            </div>
            <Badge variant="outline">{jobs.length}</Badge>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {groups.length === 0 ? (
            <div className="grid min-h-72 place-items-center rounded-md border border-dashed bg-background text-center text-sm text-muted-foreground">
              <div>
                <Archive className="mx-auto mb-3 h-7 w-7" />
                暂无历史记录
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map((group) => {
                const GroupIcon = group.icon
                return (
                  <section key={group.key}>
                    <div className="mb-2 flex items-center justify-between px-1">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <GroupIcon className={cn("h-4 w-4", group.key === "active" && "text-[#176b87]", group.key === "failed" && "text-destructive")} />
                        {group.title}
                      </div>
                      <Badge variant="outline">{group.jobs.length}</Badge>
                    </div>
                    <div className="space-y-2.5">
                      {group.jobs.map((job) => (
                        <JobRow
                          key={job.id}
                          job={job}
                          active={job.id === activeJobId}
                          loading={loadingJobId === job.id}
                          reanalyzing={reanalyzingJobId === job.id}
                          onOpen={(selectedJob) => {
                            onOpen(selectedJob)
                            onOpenChange(false)
                          }}
                          onReanalyze={onReanalyze}
                        />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
