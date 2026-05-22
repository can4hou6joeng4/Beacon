"use client"

import { useSyncExternalStore } from "react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

type ChartRow = {
  name: string
  value: number
  kind: "danger" | "warning" | "review" | "ok"
}

export function ResultDistributionChart({ data }: { data: ChartRow[] }) {
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  )
  const total = data.reduce((sum, row) => sum + row.value, 0)

  if (!mounted || total === 0) {
    return <div className="grid h-44 min-h-44 place-items-center rounded-md border bg-muted/30 text-sm text-muted-foreground">等待检查结果</div>
  }

  return (
    <div className="h-44 min-h-44 min-w-[1px] overflow-hidden">
      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={176}>
        <BarChart data={data} margin={{ left: -24, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
          <Tooltip />
          <Bar dataKey="value" radius={[6, 6, 2, 2]} fill="#176b87" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
