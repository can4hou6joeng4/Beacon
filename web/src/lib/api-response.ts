import { NextResponse } from "next/server"
import { isAppError } from "./app-error"

export function jsonError(error: unknown, fallback: string): NextResponse {
  if (isAppError(error)) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 })
}
