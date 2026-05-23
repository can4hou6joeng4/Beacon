"use client"

import { AlertTriangle, CheckCircle2, Clock3, FileText, ListChecks, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AuditResult, AuditRow } from "@/lib/audit-types"
import { cleanEvidenceText, evidenceLines } from "@/lib/evidence-text"

type ResultTabKey = "matches" | "near" | "valid" | "review" | "all"

function rowLabel(row: AuditRow) {
  const item = row.items?.[0]
  if (!item) return row.title || ""
  const index = item.person_index ? `${String(item.person_index).padStart(2, "0")} ` : ""
  return `${index}${item.person || ""} / ${item.bookmark || row.title || ""}`
}

function rowKey(row: AuditRow) {
  return [row.page, row.expiry_date || "", row.field_context || "", rowLabel(row)].join("\u0000")
}

function rowSearchText(row: AuditRow) {
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

function filterRows(rows: AuditRow[], query: string) {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return rows
  return rows.filter((row) => rowSearchText(row).includes(keyword))
}

function evidenceText(row: AuditRow): string {
  return cleanEvidenceText(row.field_context || row.context || row.reason || "")
}

function detailTone(row: AuditRow, result: AuditResult) {
  const key = rowKey(row)
  if (result.matches.some((item) => rowKey(item) === key)) return { label: "早于截止", variant: "destructive" as const, icon: AlertTriangle, className: "text-destructive" }
  if (result.near_expiry.some((item) => rowKey(item) === key)) return { label: "临近到期", variant: "secondary" as const, icon: Clock3, className: "text-amber-700" }
  if (result.needs_review.some((item) => rowKey(item) === key)) return { label: "需要复核", variant: "outline" as const, icon: ListChecks, className: "text-[#176b87]" }
  return { label: "已识别有效", variant: "secondary" as const, icon: CheckCircle2, className: "text-emerald-700" }
}

function ResultRows({ rows, onOpen }: { rows: AuditRow[]; onOpen: (row: AuditRow) => void }) {
  if (rows.length === 0) {
    return (
      <div className="grid min-h-48 place-items-center rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        当前分类没有记录。
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">页码</TableHead>
            <TableHead>人员 / 证件</TableHead>
            <TableHead className="w-32">到期日</TableHead>
            <TableHead>证据片段</TableHead>
            <TableHead className="w-24">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.page}-${index}`}>
              <TableCell>{row.page}</TableCell>
              <TableCell className="max-w-72 whitespace-normal font-medium">
                <span className="line-clamp-2 break-words">{rowLabel(row)}</span>
              </TableCell>
              <TableCell>
                <Badge variant={row.expiry_date ? "secondary" : "outline"}>{row.expiry_date || "待复核"}</Badge>
              </TableCell>
              <TableCell className="max-w-[42rem] whitespace-normal text-muted-foreground">
                <EvidencePreview text={evidenceText(row)} />
              </TableCell>
              <TableCell>
                <Button variant="outline" size="sm" onClick={() => onOpen(row)}>
                  查看
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function EvidencePreview({ text }: { text: string }) {
  return (
    <div className="max-h-12 overflow-hidden text-sm leading-6">
      <span className="line-clamp-2 break-words">{text || "无证据片段"}</span>
    </div>
  )
}

export function ResultTable({ result }: { result: AuditResult | null }) {
  const [selected, setSelected] = useState<AuditRow | null>(null)
  const [query, setQuery] = useState("")
  const valid = useMemo(() => {
    if (!result) return []
    const flagged = new Set([...result.matches, ...result.near_expiry].map(rowKey))
    return result.candidates.filter((row) => row.expiry_date && !flagged.has(rowKey(row)))
  }, [result])
  const all = useMemo(() => {
    if (!result) return []
    return [...result.candidates, ...result.needs_review]
  }, [result])
  const defaultTab = useMemo<ResultTabKey>(() => {
    if (!result) return "matches"
    if (result.matches.length > 0) return "matches"
    if (result.near_expiry.length > 0) return "near"
    if (valid.length > 0) return "valid"
    if (result.needs_review.length > 0) return "review"
    return "all"
  }, [result, valid.length])

  if (!result) {
    return <div className="grid min-h-64 place-items-center rounded-lg border bg-card text-muted-foreground">等待检查结果</div>
  }

  const tabs: Array<{
    value: ResultTabKey
    label: string
    count: number
    icon: typeof AlertTriangle
    rows: AuditRow[]
    tone: string
  }> = [
    { value: "matches", label: "早于截止日期", count: result.matches.length, icon: AlertTriangle, rows: result.matches, tone: "text-destructive" },
    { value: "near", label: "临近到期", count: result.near_expiry.length, icon: Clock3, rows: result.near_expiry, tone: "text-amber-700" },
    { value: "valid", label: "已识别有效", count: valid.length, icon: CheckCircle2, rows: valid, tone: "text-emerald-700" },
    { value: "review", label: "需要复核", count: result.needs_review.length, icon: ListChecks, rows: result.needs_review, tone: "text-[#176b87]" },
    { value: "all", label: "全部记录", count: all.length, icon: ListChecks, rows: all, tone: "text-slate-700" },
  ]

  const defaultActive = tabs.find((tab) => tab.value === defaultTab) ?? tabs[0]

  return (
    <>
      <Tabs key={result.job_id} defaultValue={defaultTab} className="space-y-3">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-semibold">结果分类</div>
            <div className="mt-1 text-xs text-muted-foreground">已识别有效包含晚于截止日期的证件；全部记录同时包含复核项。</div>
          </div>
          <Badge variant="outline" className="h-6 self-start lg:self-auto">
            默认查看 {defaultActive.label} · {defaultActive.count}
          </Badge>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 pl-9"
            placeholder="搜索人员、证件、页码或 OCR 片段"
          />
        </div>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 lg:grid-cols-5">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const disabled = tab.count === 0
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                disabled={disabled}
                className="h-14 justify-start rounded-lg border bg-card px-3 py-2 text-left data-active:border-[#176b87] data-active:bg-[#eef7fa] data-active:shadow-sm disabled:bg-muted/30 disabled:text-muted-foreground/60 dark:data-active:bg-cyan-950/30 dark:data-active:border-cyan-800/70"
              >
                <Icon className={`h-4 w-4 ${disabled ? "text-muted-foreground/50" : tab.tone}`} />
                <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                <Badge variant={disabled ? "outline" : tab.value === "matches" && tab.count > 0 ? "destructive" : "secondary"}>{tab.count}</Badge>
              </TabsTrigger>
            )
          })}
        </TabsList>
        {tabs.map((tab) => {
          const rows = filterRows(tab.rows, query)
          return (
          <TabsContent key={tab.value} value={tab.value}>
            <ResultRows rows={rows} onOpen={setSelected} />
          </TabsContent>
          )
        })}
      </Tabs>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>
          {selected ? (
            <RecordDialogContent row={selected} result={result} />
          ) : (
            <DialogHeader>
              <DialogTitle>证据详情</DialogTitle>
            </DialogHeader>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function RecordDialogContent({ row, result }: { row: AuditRow; result: AuditResult }) {
  const tone = detailTone(row, result)
  const ToneIcon = tone.icon

  return (
    <>
      <DialogHeader className="border-b pr-12">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant={tone.variant}>
            <ToneIcon className={`h-3.5 w-3.5 ${tone.className}`} />
            {tone.label}
          </Badge>
          <Badge variant="outline">第 {row.page} 页</Badge>
          <Badge variant={row.expiry_date ? "secondary" : "outline"}>{row.expiry_date || "待复核"}</Badge>
        </div>
        <DialogTitle className="line-clamp-2">{rowLabel(row) || row.title || "证据详情"}</DialogTitle>
        <DialogDescription>{row.reason || "查看字段片段与 OCR 上下文，辅助人工复核。"}</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 overflow-y-auto px-5 pb-5 text-sm">
        <div className="grid gap-3 py-4 sm:grid-cols-3">
          <div className="rounded-md border bg-[#f8fbfc] p-3 dark:bg-muted/20">
            <div className="text-xs font-semibold text-muted-foreground">页码</div>
            <div className="mt-1 text-xl font-semibold">{row.page}</div>
          </div>
          <div className="rounded-md border bg-[#f8fbfc] p-3 dark:bg-muted/20">
            <div className="text-xs font-semibold text-muted-foreground">解析有效期</div>
            <div className="mt-1 text-xl font-semibold">{row.expiry_date || "待复核"}</div>
          </div>
          <div className="rounded-md border bg-[#f8fbfc] p-3 dark:bg-muted/20">
            <div className="text-xs font-semibold text-muted-foreground">证据类型</div>
            <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
              <FileText className="h-4 w-4 text-[#176b87]" />
              {tone.label}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <section>
            <div className="mb-2 font-semibold">字段片段</div>
            <ReadableTextBlock text={row.field_context || row.context || "无字段片段"} className="max-h-44" />
          </section>

          <section>
            <div className="mb-2 font-semibold">OCR 上下文</div>
            <ReadableTextBlock text={row.context || "无 OCR 上下文"} className="max-h-72" />
          </section>

          {row.items?.length ? (
            <section>
              <div className="mb-2 font-semibold">书签路径</div>
              <div className="space-y-2">
                {row.items.map((item, index) => (
                  <div key={`${item.person}-${item.bookmark}-${index}`} className="rounded-md border bg-background p-3 text-muted-foreground">
                    <div className="font-medium text-foreground">{item.person || "未识别人员"}</div>
                    <div className="mt-1">{item.bookmark || row.title || "未识别证件"}</div>
                    <div className="mt-1 text-xs">页码范围 {item.start_page ?? "?"} - {item.end_page ?? "?"}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </>
  )
}

function ReadableTextBlock({ text, className }: { text: string; className?: string }) {
  const lines = evidenceLines(text)
  const visibleLines = lines.length > 0 ? lines : ["无内容"]
  return (
    <div className={`overflow-y-auto rounded-md border bg-muted/40 p-3 text-muted-foreground ${className ?? ""}`}>
      <div className="space-y-2">
        {visibleLines.map((line, index) => (
          <p key={`${line}-${index}`} className="break-words leading-6">
            {line}
          </p>
        ))}
      </div>
    </div>
  )
}
