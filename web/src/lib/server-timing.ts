type TimingEntry = {
  name: string
  description?: string
  durationMs: number
}

export type ServerTimingTracker = {
  measure<T>(name: string, fn: () => Promise<T>, description?: string): Promise<T>
  header(): string
}

export function createServerTimingTracker(): ServerTimingTracker {
  const entries: TimingEntry[] = []
  return {
    async measure<T>(name: string, fn: () => Promise<T>, description?: string): Promise<T> {
      const startedAt = performance.now()
      try {
        return await fn()
      } finally {
        entries.push({
          name,
          description,
          durationMs: performance.now() - startedAt,
        })
      }
    },
    header(): string {
      return entries.map(formatTimingEntry).join(", ")
    },
  }
}

export function responseWithServerTiming(response: Response, tracker: ServerTimingTracker): Response {
  const value = tracker.header()
  if (value) response.headers.set("Server-Timing", value)
  return response
}

function formatTimingEntry(entry: TimingEntry): string {
  const description = entry.description ? `;desc="${sanitizeDescription(entry.description)}"` : ""
  return `${sanitizeToken(entry.name)}${description};dur=${Math.max(0, entry.durationMs).toFixed(1)}`
}

function sanitizeToken(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_") || "step"
}

function sanitizeDescription(value: string): string {
  return value.replace(/["\\]/g, "")
}
