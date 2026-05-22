import { NextResponse } from "next/server"
import { getAuditDb } from "@/lib/audit-db"

export const runtime = "nodejs"

export async function GET() {
  const db = await getAuditDb()
  const jobs = await db.listJobs(20)
  return NextResponse.json({ jobs })
}
