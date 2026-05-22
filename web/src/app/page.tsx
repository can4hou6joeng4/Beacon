import { AuditCommandCenter } from "@/components/audit/audit-command-center"
import { getAuditDb } from "@/lib/audit-db"
import { fetchPythonResult, resultDistribution } from "@/lib/audit-python"

export default async function Home({ searchParams }: { searchParams?: Promise<{ token?: string }> }) {
  const params = await searchParams
  const db = getAuditDb()
  let jobs = db.listJobs(20)
  let initialResult = null

  const latest = jobs[0]
  if (latest?.status === "complete" && latest.pythonJobId) {
    try {
      const result = await fetchPythonResult(latest.pythonJobId)
      const job = db.updateFromResult(latest.id, result.summary, {
        certificate_pages: result.manifest?.certificate_pages,
      })
      jobs = db.listJobs(20)
      if (job) {
        initialResult = {
          job,
          result,
          distribution: resultDistribution(result.summary),
        }
      }
    } catch {
      initialResult = null
    }
  }

  return <AuditCommandCenter initialHistory={jobs} initialResult={initialResult} accessToken={params?.token ?? ""} />
}
