"use client"

import { useState } from "react"
import { LocalDateTime, statusLabel } from "@/components/audit/report-format"
import { Rise } from "@/components/audit/rise"
import { cn } from "@/lib/utils"
import type { AuditHistoryJob } from "@/lib/audit-types"

function canOpen(job: AuditHistoryJob): boolean {
  return job.runtime === "paddleocr" && Boolean(job.providerJobId)
}

function HistoryRow({
  job,
  busy,
  onOpenComplete,
  onOpenRunning,
  onReanalyze,
}: {
  job: AuditHistoryJob
  busy: boolean
  onOpenComplete: (job: AuditHistoryJob) => void
  onOpenRunning: (job: AuditHistoryJob) => void
  onReanalyze: (job: AuditHistoryJob) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const complete = job.status === "complete"
  const failed = job.status === "failed"
  const active = job.status === "running" || job.status === "queued"
  const clickable = failed || (canOpen(job) && (complete || active))
  const canReanalyze = complete && canOpen(job) && Boolean(job.objectKey)

  const head = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[15.5px] font-semibold break-all">{job.filename}</span>
        <span className="num text-[13px] text-faint">
          <LocalDateTime iso={job.createdAt} /> · 截止 {job.cutoff} ·{" "}
          {active ? (
            <span>云端处理中 · {job.pagesOcr}/{job.ocrTotalPages || "?"} 页</span>
          ) : (
            <span className={failed ? "text-destructive" : ""}>{statusLabel(job.status)}</span>
          )}
        </span>
      </span>
      <span className="num whitespace-nowrap text-[13.5px] text-muted-foreground">
        {complete ? (
          <>
            <span className={job.matches > 0 ? "text-destructive" : ""}>命中 {job.matches}</span>
            <span className="mx-[7px] text-faint">·</span>
            <span>复核 {job.needsReview}</span>
            <span className="mx-[7px] text-faint">·</span>
            <span>页 {job.ocrTotalPages}</span>
          </>
        ) : (
          <span className="text-faint">{failed ? "查看原因" : "—"}</span>
        )}
      </span>
    </>
  )

  function handleClick() {
    if (busy) return
    if (failed) {
      setExpanded((current) => !current)
      return
    }
    if (complete) {
      onOpenComplete(job)
      return
    }
    onOpenRunning(job)
  }

  return (
    <div className="border-b border-hair">
      {clickable ? (
        <button
          type="button"
          className={cn(
            "group flex w-full items-baseline justify-between gap-5 px-0.5 py-4.5 text-left focus-visible:outline-offset-[-2px]",
            busy && "opacity-60",
          )}
          onClick={handleClick}
        >
          {head}
        </button>
      ) : (
        <span className="flex w-full items-baseline justify-between gap-5 px-0.5 py-4.5">{head}</span>
      )}
      {failed && expanded ? <div className="animate-swap px-0.5 pb-4.5 text-[13.5px] leading-relaxed text-destructive">{job.message}</div> : null}
      {canReanalyze ? (
        <div className="flex justify-end px-0.5 pb-3">
          <button
            type="button"
            className="inline-flex min-h-8 items-center px-1 text-[13px] text-primary transition-colors hover:text-primary-press hover:underline hover:underline-offset-4 disabled:opacity-50"
            disabled={busy}
            onClick={() => onReanalyze(job)}
          >
            重新分析
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function HistoryScreen({
  jobs,
  busyJobId,
  onOpenComplete,
  onOpenRunning,
  onReanalyze,
}: {
  jobs: AuditHistoryJob[]
  busyJobId: string | null
  onOpenComplete: (job: AuditHistoryJob) => void
  onOpenRunning: (job: AuditHistoryJob) => void
  onReanalyze: (job: AuditHistoryJob) => void
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 pt-12 pb-24 sm:px-6 sm:pt-18 sm:pb-32">
      <Rise index={0}>
        <div className="font-latin text-[13px] font-medium tracking-[0.22em] uppercase text-primary">历史</div>
      </Rise>
      <Rise index={1} className="mt-3">
        <h1 className="text-[26px] font-bold leading-snug tracking-[0.01em]">最近的检查任务</h1>
      </Rise>
      <Rise index={2} className="mt-10">
        <div className="border-t border-ink">
          {jobs.length === 0 ? (
            <div className="border-b border-hair px-0.5 py-4.5 text-[13.5px] text-faint">暂无检查记录</div>
          ) : (
            jobs.map((job) => (
              <HistoryRow
                key={job.id}
                job={job}
                busy={busyJobId === job.id}
                onOpenComplete={onOpenComplete}
                onOpenRunning={onOpenRunning}
                onReanalyze={onReanalyze}
              />
            ))
          )}
        </div>
      </Rise>
    </main>
  )
}
