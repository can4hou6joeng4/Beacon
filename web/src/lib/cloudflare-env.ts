import { getCloudflareContext } from "@opennextjs/cloudflare"

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike
  batch?<T = unknown>(statements: D1PreparedStatementLike[]): Promise<T[]>
}

export type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<{ results?: T[] }>
  run(): Promise<unknown>
}

type CloudflareBindings = {
  AUDIT_DB?: unknown
}

export async function getCloudflareD1Binding(): Promise<D1DatabaseLike | null> {
  if (process.env.AUDIT_DB_DRIVER === "sqlite") return null
  if (process.env.NEXT_RUNTIME !== "nodejs" && !process.env.OPEN_NEXT_BUILD_ID) return null

  try {
    const context = await getCloudflareContext({ async: true })
    const env = context.env as CloudflareBindings
    return env.AUDIT_DB ? (env.AUDIT_DB as D1DatabaseLike) : null
  } catch {
    return null
  }
}
