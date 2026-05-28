export type QuotaUsageWindow = {
  startIso: string
  endIso: string
}

export function currentUtcDayQuotaWindow(now = new Date()): QuotaUsageWindow {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 1)
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}
