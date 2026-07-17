import { ReportFlowApp } from "@/components/audit/report-flow-app"
import { SignInPanel } from "@/components/auth/sign-in-panel"
import { getAuditDb } from "@/lib/audit-db"
import { getAuthContextFromCookieHeader } from "@/lib/auth"
import { cookies } from "next/headers"

export default async function Home() {
  const cookieStore = await cookies()
  const context = await getAuthContextFromCookieHeader(cookieStore.toString())

  if (!context) {
    return <SignInPanel />
  }

  const db = await getAuditDb()
  const jobs = await db.listJobs(20, { id: context.user.id, role: context.user.role })
  const defaultCutoff = new Date().toISOString().slice(0, 10)

  return (
    <ReportFlowApp
      initialHistory={jobs}
      currentUser={{ ...context.user, quota: context.quota }}
      defaultCutoff={defaultCutoff}
    />
  )
}
