"use client"

import { ChevronDown, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { LocalDateTime, daysFromCutoff } from "@/components/audit/report-format"
import { Rise } from "@/components/audit/rise"
import { Button } from "@/components/ui/button"
import type { AuditHistoryJob, AuditResult, AuditRow } from "@/lib/audit-types"
import { cleanEvidenceText, evidenceLines } from "@/lib/evidence-text"
import { cn } from "@/lib/utils"

const DOWNLOAD_FILES = ["matches.csv", "result.json", "ocr.txt"] as const

type SectionKey = "match" | "near" | "review" | "valid"

const SECTION_COLORS: Record<SectionKey, string> = {
  match: "var(--destructive)",
  near: "var(--near)",
  review: "var(--review)",
  valid: "var(--ok)",
}

function rowLabel(row: AuditRow): string {
  const item = row.items?.[0]
  if (!item) return row.title || ""
  const index = item.person_index ? `${String(item.person_index).padStart(2, "0")} ` : ""
  return `${index}${item.person || ""} / ${item.bookmark || row.title || ""}`
}

function rowKey(row: AuditRow): string {
  return [row.page, row.expiry_date || "", row.field_context || "", rowLabel(row)].join("\u0000")
}

function rowSearchText(row: AuditRow): string {
  return [
    row.page,
    row.title,
    row.expiry_date,
    row.reason,
    row.field_context,
    row.context,
    row.items?.map((item) => [item.person, item.bookmark, item.start_page, item.end_page].join(" ")).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

function expiryText(row: AuditRow): { text: string; days: string } {
  if (!row.expiry_date) return { text: "日期未识别", days: "待复核" }
  if (row.expiry_date === "长期") return { text: "长期", days: "长期有效" }
  return { text: row.expiry_date, days: "" }
}

function ReportRow({
  row,
  sectionKey,
  cutoff,
  open,
  onToggle,
}: {
  row: AuditRow
  sectionKey: SectionKey
  cutoff: string
  open: boolean
  onToggle: () => void
}) {
  const item = row.items?.[0]
  const person = item?.person
  const primary = person || row.title || "未识别证件"
  const secondary = person ? item?.bookmark || row.title : ""
  const expiry = expiryText(row)
  const delta = daysFromCutoff(row.expiry_date, cutoff)
  const daysText = expiry.days || (delta === null ? "待复核" : delta < 0 ? `距截止 ${delta} 天` : `距截止 +${delta} 天`)
  const quote = cleanEvidenceText(row.field_context || row.context || "")
  const contextLines = evidenceLines(row.context || "")

  return (
    <div className="border-b border-hair">
      <button
        type="button"
        className="group flex w-full items-center gap-4.5 px-0.5 py-4 text-left focus-visible:outline-offset-[-2px]"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="text-base font-semibold transition-colors group-hover:text-primary">{primary}</span>
          {secondary ? <span className="text-[15px] text-muted-foreground">{secondary}</span> : null}
        </span>
        <span className="flex flex-wrap items-baseline justify-end gap-x-3.5 gap-y-1 whitespace-nowrap">
          <span
            className={cn("text-[15px] font-medium", row.expiry_date ? "num" : "text-[13.5px]")}
            style={
              sectionKey === "match" && row.expiry_date
                ? { color: "var(--destructive)" }
                : !row.expiry_date
                  ? { color: "var(--review)" }
                  : undefined
            }
          >
            {expiry.text}
          </span>
          <span className="num text-[12.5px] text-faint">{daysText}</span>
          <span className="num min-w-11 text-right text-[12.5px] tracking-[0.04em] text-faint">P.{row.page}</span>
          <ChevronDown className={cn("size-4 self-center text-faint transition-transform duration-250", open && "rotate-180")} />
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-4 px-0.5 pt-1 pb-6.5">
            <div>
              <div className="mb-1.5 text-xs font-medium tracking-[0.18em] text-faint">字段片段</div>
              <blockquote className="rounded-lg bg-sunken px-4.5 py-3.5 text-[15px] leading-relaxed break-words">
                {quote || "无字段片段"}
              </blockquote>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium tracking-[0.18em] text-faint">OCR 上下文</div>
              <div className="max-h-33 space-y-1 overflow-auto pr-2 text-sm leading-relaxed text-muted-foreground">
                {(contextLines.length > 0 ? contextLines : ["无 OCR 上下文"]).map((line, index) => (
                  <p key={`${line}-${index}`} className="break-words">
                    {line}
                  </p>
                ))}
              </div>
            </div>
            {item ? (
              <div className="num text-[13.5px] text-muted-foreground">
                书签路径：{item.bookmark || row.title || "—"} · 第 {item.person_index ?? "?"} 位人员 · P.{item.start_page ?? "?"}–{item.end_page ?? "?"}
              </div>
            ) : null}
            {row.reason ? (
              <div className="text-[13px]" style={{ color: SECTION_COLORS[sectionKey] }}>
                {row.reason}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ReportScreen({
  job,
  result,
  reanalyzing,
  onReanalyze,
  onNewAudit,
}: {
  job: AuditHistoryJob
  result: AuditResult
  reanalyzing: boolean
  onReanalyze: () => void
  onNewAudit: () => void
}) {
  const summary = result.summary
  const [query, setQuery] = useState("")
  const [openKey, setOpenKey] = useState<string | null>(null)

  const validRows = useMemo(() => {
    const flagged = new Set([...result.matches, ...result.near_expiry].map(rowKey))
    return result.candidates.filter((row) => row.expiry_date && !flagged.has(rowKey(row)))
  }, [result])

  const sections = useMemo(
    () =>
      [
        { key: "match" as const, title: "截止日内到期", rows: result.matches },
        { key: "near" as const, title: "临近到期", rows: result.near_expiry },
        { key: "review" as const, title: "需要复核", rows: result.needs_review },
        { key: "valid" as const, title: "已识别有效", rows: validRows },
      ].map((section) => ({ ...section, color: SECTION_COLORS[section.key] })),
    [result, validRows],
  )

  const counts = {
    match: result.matches.length,
    near: result.near_expiry.length,
    review: result.needs_review.length,
    valid: validRows.length,
  }
  const stats = [
    { key: "match" as const, label: "命中", value: counts.match },
    { key: "near" as const, label: "临近", value: counts.near },
    { key: "review" as const, label: "复核", value: counts.review },
    { key: "valid" as const, label: "有效", value: counts.valid },
  ]

  const keyword = query.trim().toLowerCase()
  const matchesQuery = (row: AuditRow) => !keyword || rowSearchText(row).includes(keyword)
  const completedAt = job.completedAt || job.updatedAt
  const ocrTotal = summary.ocr_total_pages ?? job.ocrTotalPages

  return (
    <main className="mx-auto w-full max-w-[888px] px-5 pt-12 pb-24 sm:px-6 sm:pt-18 sm:pb-32">
      <Rise index={0}>
        <div className="font-latin text-[13px] font-medium tracking-[0.22em] uppercase text-muted-foreground">
          审计报告 · <span className="num">№ {job.id.slice(0, 8)}</span>
        </div>
      </Rise>
      <Rise index={1} className="mt-4">
        <h1 className="max-w-3xl text-[clamp(30px,4.6vw,44px)] font-bold leading-[1.32] tracking-[0.01em]">
          发现
          <span className="num mx-1 tracking-[-0.03em]" style={{ color: counts.match > 0 ? "var(--destructive)" : "var(--primary)" }}>
            {counts.match}
          </span>
          项证件在截止日前到期
        </h1>
      </Rise>
      <Rise index={2} className="mt-4">
        <p className="max-w-2xl text-base">
          共审阅 {ocrTotal} 页，识别出 {summary.validity_candidates} 项有效期字段：{counts.near} 项临近到期、{counts.review} 项需要人工复核、{counts.valid} 项在有效期内。
        </p>
      </Rise>
      <Rise index={3} className="mt-4">
        <div className="num text-[13.5px] text-faint break-all">
          {job.filename} · 截止日期 {summary.cutoff} · 完成于 <LocalDateTime iso={completedAt} /> · OCR 覆盖 {summary.pages_ocr}/{ocrTotal} 页
        </div>
      </Rise>
      <Rise index={4} className="mt-12">
        <div className="grid grid-cols-2 gap-6 gap-y-8 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.key}>
              <span className="mb-3 block h-[3px] w-3.5 rounded-sm" style={{ background: SECTION_COLORS[stat.key] }}></span>
              <div className="num text-[42px] font-bold leading-none tracking-[-0.03em]">{stat.value}</div>
              <div className="mt-2 text-[13px] text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </Rise>
      <Rise index={5} className="mt-10">
        <div className="flex h-1.5 gap-[3px]" aria-hidden="true">
          {stats
            .filter((stat) => stat.value > 0)
            .map((stat) => (
              <span
                key={stat.key}
                className="block h-full min-w-1.5 rounded-full"
                style={{ flexGrow: stat.value, background: SECTION_COLORS[stat.key] }}
              ></span>
            ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4.5 text-[12.5px] text-muted-foreground">
          {sections.map((section) => (
            <span key={section.key} className="inline-flex items-center gap-1.5">
              <span className="size-[7px] rounded-full" style={{ background: section.color }}></span>
              {section.title} <span className="num">{counts[section.key]}</span>
            </span>
          ))}
        </div>
      </Rise>
      <Rise index={6} className="mt-14">
        <div className="relative border-b border-hair transition-colors focus-within:border-primary">
          <Search className="pointer-events-none absolute top-1/2 left-0.5 size-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            placeholder="搜索人员、证件或书签路径"
            aria-label="搜索报告记录"
            className="min-h-12 w-full bg-transparent pr-1 pl-7.5 text-[15px] outline-none placeholder:text-faint"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </Rise>
      {sections.map((section, sectionIndex) => {
        const visible = section.rows.filter(matchesQuery)
        return (
          <Rise key={section.key} index={7 + sectionIndex} className="mt-12">
            <section>
              <div className="flex items-center gap-2.5 border-b border-ink pb-2.5">
                <span className="block h-[3px] w-3 flex-none rounded-sm" style={{ background: section.color }}></span>
                <span className="text-[15px] font-semibold tracking-[0.08em]">{section.title}</span>
                <span className="num text-[13px] font-medium tracking-[0.04em] text-muted-foreground">
                  {keyword ? `${visible.length} / ${section.rows.length}` : section.rows.length}
                </span>
              </div>
              {visible.length === 0 ? (
                <div className="border-b border-hair px-0.5 py-4.5 text-[13.5px] text-faint">无匹配记录</div>
              ) : (
                visible.map((row) => {
                  const key = `${section.key}-${rowKey(row)}`
                  return (
                    <ReportRow
                      key={key}
                      row={row}
                      sectionKey={section.key}
                      cutoff={summary.cutoff}
                      open={openKey === key}
                      onToggle={() => setOpenKey(openKey === key ? null : key)}
                    />
                  )
                })
              )}
            </section>
          </Rise>
        )
      })}
      <Rise index={11} className="mt-16">
        <div className="flex flex-col items-start gap-6 border-t border-hair pt-7 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3.5">
            <span className="text-[13px] text-faint">下载</span>
            {DOWNLOAD_FILES.map((file) => (
              <a
                key={file}
                href={`/api/audit/jobs/${job.id}/download/${file}`}
                download
                className="num inline-flex min-h-10 items-center gap-1.5 px-1 text-sm text-primary transition-colors hover:text-primary-press hover:underline hover:underline-offset-4"
              >
                {file}
              </a>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3.5">
            <Button type="button" variant="hairline" disabled={reanalyzing} onClick={onReanalyze}>
              重新分析
            </Button>
            <Button type="button" onClick={onNewAudit}>
              再检查一份
            </Button>
          </div>
        </div>
      </Rise>
    </main>
  )
}
