import { NextResponse } from "next/server"
import { getAuditDb } from "@/lib/audit-db"

export const runtime = "nodejs"

export async function GET() {
  const jobs = getAuditDb().listJobs(20)
  return NextResponse.json({ jobs })
}
