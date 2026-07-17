"use client"

import { useSyncExternalStore } from "react"
import type { AuditStatusValue } from "@/lib/audit-types"

export function formatBytes(value: number): string {
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (value >= 1024 * 1024) return `${Math.round(value / 1024 / 1024)} MB`
  if (value >= 1024) return `${Math.round(value / 1024)} KB`
  return `${value} B`
}

export function statusLabel(status: AuditStatusValue): string {
  if (status === "complete") return "已完成"
  if (status === "failed") return "失败"
  if (status === "running") return "运行中"
  if (status === "queued") return "排队中"
  return "未知"
}

export function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 距截止日天数（负数 = 已在截止日前到期）；无日期或「长期」返回 null。 */
export function daysFromCutoff(expiry: string | null | undefined, cutoff: string): number | null {
  if (!expiry || expiry === "长期") return null
  const expiryMs = new Date(expiry).getTime()
  const cutoffMs = new Date(cutoff).getTime()
  if (Number.isNaN(expiryMs) || Number.isNaN(cutoffMs)) return null
  return Math.round((expiryMs - cutoffMs) / 86400000)
}

function subscribeNever() {
  return () => undefined
}

/**
 * Local-timezone datetime that is hydration-safe: the server (and the first
 * client render) show the timezone-stable ISO date part; the local wall-clock
 * form swaps in after mount via the useSyncExternalStore mounted idiom.
 */
export function LocalDateTime({ iso }: { iso: string }) {
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  )
  return <>{mounted ? formatDateTime(iso) : iso.slice(5, 10)}</>
}
