"use client"

import { X } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { Rise } from "@/components/audit/rise"
import { formatBytes } from "@/components/audit/report-format"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { PublicUser } from "@/lib/auth-types"

function addDays(anchorIso: string, offsetDays: number): string {
  const date = new Date(`${anchorIso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

export function SubmitScreen({
  currentUser,
  file,
  onPickFile,
  onClearFile,
  cutoff,
  onCutoffChange,
  dateTouched,
  onDateTouch,
  presetAnchor,
  onStart,
}: {
  currentUser: PublicUser
  file: File | null
  onPickFile: (file: File) => void
  onClearFile: () => void
  cutoff: string
  onCutoffChange: (value: string) => void
  dateTouched: boolean
  onDateTouch: () => void
  presetAnchor: string
  onStart: () => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const remaining = currentUser.quota.remaining

  const presets = [
    { label: "今天", value: presetAnchor },
    { label: "+30 天", value: addDays(presetAnchor, 30) },
    { label: "+90 天", value: addDays(presetAnchor, 90) },
  ]

  function takeFile(candidate: File | null | undefined) {
    if (!candidate) return
    if (!/\.pdf$/i.test(candidate.name)) {
      toast("仅支持 PDF 文件")
      return
    }
    onPickFile(candidate)
  }

  const currentStep = !file ? 1 : dateTouched ? 3 : 2
  const canStart = Boolean(file) && Boolean(cutoff)
  const hint = !file
    ? "请先选择需要检查的 PDF 文件"
    : !cutoff
      ? "请设定筛选截止日期"
      : "云端识别约需数分钟，转入后台后可在「历史」中继续查看"

  function stepClass(step: number) {
    if (step === currentStep) return "text-primary font-semibold"
    if (step < currentStep) return "text-foreground"
    return "text-faint"
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-5 pt-12 pb-24 sm:px-6 sm:pt-18 sm:pb-32">
      <Rise index={0}>
        <div className="font-latin text-[13px] font-medium tracking-[0.22em] uppercase text-primary">新建检查</div>
      </Rise>
      <Rise index={1} className="mt-3">
        <h1 className="text-[26px] font-bold leading-snug tracking-[0.01em]">上传一份证件汇编 PDF</h1>
      </Rise>
      <Rise index={2} className="mt-7">
        <div className="flex flex-wrap items-center gap-4">
          {[
            { step: 1, label: "选择文件" },
            { step: 2, label: "设定截止日" },
            { step: 3, label: "开始" },
          ].map(({ step, label }, index) => (
            <span key={step} className="contents">
              {index > 0 ? <span className="h-px w-7 bg-hair" aria-hidden="true"></span> : null}
              <span className={cn("inline-flex items-center gap-2 text-sm transition-colors", stepClass(step))}>
                <span className="num text-[13px] font-medium tracking-[0.08em]">{String(step).padStart(2, "0")}</span>
                {label}
              </span>
            </span>
          ))}
        </div>
      </Rise>
      <Rise index={3} className="mt-10">
        {!file ? (
          <button
            type="button"
            aria-label="选择或拖入 PDF 文件"
            className={cn(
              "flex min-h-75 w-full cursor-pointer flex-col items-center justify-center gap-2.5 rounded-lg border-[1.5px] border-dashed border-hair p-8 text-center transition-colors hover:border-primary hover:bg-accent",
              dragOver && "border-primary bg-accent",
            )}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragOver(false)
              takeFile(event.dataTransfer.files?.[0])
            }}
          >
            <span className="text-[19px] font-semibold">拖入或点击选择 PDF</span>
            <span className="text-sm text-muted-foreground">上传后进入 PaddleOCR 云端识别 · 支持含书签的扫描汇编</span>
          </button>
        ) : (
          <div className="flex items-center gap-3.5 rounded-lg border border-hair bg-card px-4.5 py-4">
            <span className="min-w-0 flex-1 text-[15px] font-semibold break-all">{file.name}</span>
            <span className="num whitespace-nowrap text-[13.5px] text-faint">{formatBytes(file.size)}</span>
            <button
              type="button"
              aria-label="移除文件"
              className="inline-flex size-10 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sunken hover:text-destructive"
              onClick={onClearFile}
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => {
            takeFile(event.target.files?.[0])
            event.target.value = ""
          }}
        />
      </Rise>
      <Rise index={4} className="mt-12">
        <label className="block text-[12.5px] tracking-[0.14em] text-faint" htmlFor="cutoff-input">
          筛选截止日期
        </label>
        <div className="mt-2.5 flex flex-wrap items-end gap-7">
          <input
            id="cutoff-input"
            type="date"
            className="num min-h-13 w-full max-w-70 border-0 border-b border-hair bg-transparent px-0.5 py-1 text-[22px] font-medium tracking-[-0.01em] outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:shadow-[0_1px_0_0_var(--primary)] focus-visible:outline-none"
            value={cutoff}
            onFocus={onDateTouch}
            onChange={(event) => {
              onCutoffChange(event.target.value)
              onDateTouch()
            }}
          />
          <div className="flex flex-wrap gap-2.5 pb-1.5">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={cn(
                  "num min-h-10 rounded-full border border-hair px-4.5 text-[13.5px] text-muted-foreground transition-colors hover:border-ink hover:text-foreground",
                  cutoff === preset.value && "border-primary bg-accent text-primary hover:border-primary hover:text-primary",
                )}
                onClick={() => {
                  onCutoffChange(preset.value)
                  onDateTouch()
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 text-[13px] text-faint">到期日不晚于该日期的证件，将被标记为「截止日内到期」</div>
      </Rise>
      <Rise index={5} className="mt-9">
        <div className="num text-[13px] text-faint">
          今日剩余：上传 {formatBytes(remaining.uploadBytes)} · OCR 任务 {remaining.ocrJobs} 次 · 页数 {remaining.ocrPages}
        </div>
      </Rise>
      <Rise index={6} className="mt-5">
        <Button type="button" className="w-full" disabled={!canStart} onClick={onStart}>
          开始检查
        </Button>
        <div className="mt-3 text-[13px] text-faint">{hint}</div>
      </Rise>
    </main>
  )
}
