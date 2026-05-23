import { AuditCommandCenter } from "@/components/audit/audit-command-center"
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

  return <AuditCommandCenter initialHistory={jobs} initialResult={null} currentUser={{ ...context.user, quota: context.quota }} />
}
