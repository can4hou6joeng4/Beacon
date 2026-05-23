"use client"

import { CheckCircle2, Database, HardDrive, RefreshCw, Save, UserPlus, XCircle } from "lucide-react"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CreateUserInput, PublicUser, UserRole, UserStatus } from "@/lib/auth-types"
import {
  BYTES_PER_MEGABYTE,
  CLOUDFLARE_D1_FREE_ROWS_READ_DAY,
  CLOUDFLARE_D1_FREE_ROWS_WRITTEN_DAY,
  DEFAULT_OCR_JOB_QUOTA,
  DEFAULT_OCR_PAGE_QUOTA,
  DEFAULT_UPLOAD_QUOTA_MB,
  PADDLEOCR_DAILY_PDF_PAGE_LIMIT,
} from "@/lib/quota-limits"

type UsersPayload = {
  users?: PublicUser[]
  error?: string
}

type UserPayload = {
  user?: PublicUser
  error?: string
}

type CreateFormState = {
  email: string
  name: string
  password: string
  role: UserRole
  uploadMb: string
  ocrJobs: string
  ocrPages: string
}

type UserEditState = {
  name: string
  role: UserRole
  status: UserStatus
  uploadMb: string
  ocrJobs: string
  ocrPages: string
}

const DEFAULT_CREATE_FORM: CreateFormState = {
  email: "",
  name: "",
  password: "",
  role: "user",
  uploadMb: String(DEFAULT_UPLOAD_QUOTA_MB),
  ocrJobs: String(DEFAULT_OCR_JOB_QUOTA),
  ocrPages: String(DEFAULT_OCR_PAGE_QUOTA),
}

export function AdminUserPanel({ currentUser }: { currentUser: PublicUser }) {
  const [users, setUsers] = useState<PublicUser[]>([])
  const [edits, setEdits] = useState<Record<string, UserEditState>>({})
  const [form, setForm] = useState<CreateFormState>(DEFAULT_CREATE_FORM)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    void loadUsers()
  }, [])

  const activeUsers = useMemo(() => users.filter((user) => user.status === "active").length, [users])

  async function loadUsers() {
    setIsLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" })
      const payload = (await response.json().catch(() => ({ error: "读取用户失败" }))) as UsersPayload
      if (!response.ok) {
        setError(payload.error || "读取用户失败")
        return
      }
      const loaded = payload.users ?? []
      setUsers(loaded)
      setEdits(Object.fromEntries(loaded.map((user) => [user.id, userToEdit(user)])))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取用户失败")
    } finally {
      setIsLoading(false)
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsCreating(true)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          name: form.name,
          password: form.password,
          role: form.role,
          quota: formToQuota(form),
        } satisfies CreateUserInput),
      })
      const payload = (await response.json().catch(() => ({ error: "创建用户失败" }))) as UserPayload
      if (!response.ok || !payload.user) {
        setError(payload.error || "创建用户失败")
        return
      }
      setForm(DEFAULT_CREATE_FORM)
      setMessage("用户已创建")
      await loadUsers()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建用户失败")
    } finally {
      setIsCreating(false)
    }
  }

  async function updateUser(user: PublicUser, patch: Partial<UserEditState> = {}) {
    const edit = { ...edits[user.id], ...patch }
    if (!edit.name) return
    setBusyUserId(user.id)
    setError("")
    setMessage("")
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: edit.name,
          role: edit.role,
          status: edit.status,
          quota: editToQuota(edit),
        }),
      })
      const payload = (await response.json().catch(() => ({ error: "更新用户失败" }))) as UserPayload
      if (!response.ok || !payload.user) {
        setError(payload.error || "更新用户失败")
        return
      }
      setMessage("用户已更新")
      await loadUsers()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "更新用户失败")
    } finally {
      setBusyUserId(null)
    }
  }

  function updateEdit(userId: string, patch: Partial<UserEditState>) {
    setEdits((current) => ({
      ...current,
      [userId]: { ...current[userId], ...patch },
    }))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">用户管理</div>
          <div className="text-xs text-muted-foreground">{activeUsers}/{users.length} active</div>
        </div>
        <Button type="button" variant="outline" size="icon-sm" onClick={loadUsers} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          <span className="sr-only">刷新用户</span>
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {message ? (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <form className="rounded-md border bg-background p-3 dark:bg-card" onSubmit={createUser}>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <UserPlus className="h-4 w-4 text-[#176b87]" />
          创建用户
        </div>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="admin-email">邮箱</Label>
            <Input id="admin-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-name">名称</Label>
            <Input id="admin-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-password">初始密码</Label>
            <Input
              id="admin-password"
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              minLength={10}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="admin-role">角色</Label>
              <select
                id="admin-role"
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value === "admin" ? "admin" : "user" })}
              >
                <option value="user">用户</option>
                <option value="admin">管理员</option>
              </select>
            </div>
          </div>
          <div className="grid gap-2 rounded-md border bg-muted/20 p-2">
            <QuotaNumberField
              id="admin-upload"
              label="上传 MB"
              value={form.uploadMb}
              max={DEFAULT_UPLOAD_QUOTA_MB}
              onChange={(value) => setForm({ ...form, uploadMb: value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <QuotaNumberField
                id="admin-jobs"
                label="OCR 任务"
                value={form.ocrJobs}
                onChange={(value) => setForm({ ...form, ocrJobs: value })}
              />
              <QuotaNumberField
                id="admin-pages"
                label="OCR 页"
                value={form.ocrPages}
                max={PADDLEOCR_DAILY_PDF_PAGE_LIMIT}
                onChange={(value) => setForm({ ...form, ocrPages: value })}
              />
            </div>
          </div>
          <Button type="submit" className="bg-[#176b87] hover:bg-[#145d75]" disabled={isCreating}>
            <UserPlus className="h-4 w-4" />
            {isCreating ? "创建中" : "创建"}
          </Button>
        </div>
      </form>

      <QuotaBoundarySummary />

      <div className="space-y-3">
        {users.map((user) => {
          const edit = edits[user.id] ?? userToEdit(user)
          const isSelf = user.id === currentUser.id
          return (
            <section key={user.id} className="rounded-md border bg-background p-3 dark:bg-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                  <Input value={edit.name} onChange={(event) => updateEdit(user.id, { name: event.target.value })} />
                  <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                </div>
                <Badge variant={user.status === "active" ? "secondary" : "destructive"} className="shrink-0">
                  {user.status === "active" ? "active" : "disabled"}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <select
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  value={edit.role}
                  onChange={(event) => updateEdit(user.id, { role: event.target.value === "admin" ? "admin" : "user" })}
                >
                  <option value="user">用户</option>
                  <option value="admin">管理员</option>
                </select>
                <select
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                  value={edit.status}
                  disabled={isSelf}
                  onChange={(event) => updateEdit(user.id, { status: event.target.value === "disabled" ? "disabled" : "active" })}
                >
                  <option value="active">启用</option>
                  <option value="disabled">禁用</option>
                </select>
              </div>

              <div className="mt-3 grid gap-2 rounded-md border bg-muted/20 p-2">
                <QuotaNumberField
                  label="上传 MB"
                  value={edit.uploadMb}
                  max={DEFAULT_UPLOAD_QUOTA_MB}
                  onChange={(value) => updateEdit(user.id, { uploadMb: value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <QuotaNumberField label="OCR 任务" value={edit.ocrJobs} onChange={(value) => updateEdit(user.id, { ocrJobs: value })} />
                  <QuotaNumberField
                    label="OCR 页"
                    value={edit.ocrPages}
                    max={PADDLEOCR_DAILY_PDF_PAGE_LIMIT}
                    onChange={(value) => updateEdit(user.id, { ocrPages: value })}
                  />
                </div>
                <div className="rounded bg-background px-2 py-1.5 text-xs text-muted-foreground dark:bg-muted/20">
                  已用 {formatBytes(user.quota.usage.uploadBytes)} · {user.quota.usage.ocrJobs} job · {user.quota.usage.ocrPages} 页
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busyUserId === user.id} onClick={() => updateUser(user)}>
                  <Save className="h-4 w-4" />
                  保存
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={edit.status === "active" ? "destructive" : "outline"}
                  disabled={busyUserId === user.id || isSelf}
                  onClick={() => updateUser(user, { status: edit.status === "active" ? "disabled" : "active" })}
                >
                  {edit.status === "active" ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  {edit.status === "active" ? "禁用" : "启用"}
                </Button>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function QuotaBoundarySummary() {
  return (
    <div className="grid gap-2 rounded-md border bg-[#f8fbfc] p-3 text-xs text-muted-foreground dark:bg-muted/20">
      <div className="flex items-start gap-2">
        <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#176b87]" />
        <span>R2 10GB/月 · Class A 100万/月 · Class B 1000万/月</span>
      </div>
      <div className="flex items-start gap-2">
        <Database className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#176b87]" />
        <span>D1 5GB · 读 {formatCount(CLOUDFLARE_D1_FREE_ROWS_READ_DAY)}/天 · 写 {formatCount(CLOUDFLARE_D1_FREE_ROWS_WRITTEN_DAY)}/天</span>
      </div>
    </div>
  )
}

function QuotaNumberField({
  id,
  label,
  value,
  max,
  onChange,
}: {
  id?: string
  label: string
  value: string
  max?: number
  onChange: (value: string) => void
}) {
  return (
    <label className="grid gap-1 text-xs text-muted-foreground">
      <span className="font-medium">{label}</span>
      <Input id={id} className="h-8" type="number" min={0} max={max} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

function userToEdit(user: PublicUser): UserEditState {
  return {
    name: user.name,
    role: user.role,
    status: user.status,
    uploadMb: String(Math.floor(user.quota.quota.uploadBytesLimit / 1024 / 1024)),
    ocrJobs: String(user.quota.quota.ocrJobsLimit),
    ocrPages: String(user.quota.quota.ocrPagesLimit),
  }
}

function formToQuota(form: CreateFormState): CreateUserInput["quota"] {
  return {
    uploadBytesLimit: megabytesToBytes(form.uploadMb),
    ocrJobsLimit: numberFromInput(form.ocrJobs),
    ocrPagesLimit: numberFromInput(form.ocrPages),
  }
}

function editToQuota(edit: UserEditState): CreateUserInput["quota"] {
  return {
    uploadBytesLimit: megabytesToBytes(edit.uploadMb),
    ocrJobsLimit: numberFromInput(edit.ocrJobs),
    ocrPagesLimit: numberFromInput(edit.ocrPages),
  }
}

function megabytesToBytes(value: string): number {
  return numberFromInput(value) * BYTES_PER_MEGABYTE
}

function numberFromInput(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (value >= 1024 * 1024) return `${Math.round(value / 1024 / 1024)} MB`
  if (value >= 1024) return `${Math.round(value / 1024)} KB`
  return `${value} B`
}

function formatCount(value: number): string {
  if (value >= 10_000) return `${value / 10_000}万`
  return String(value)
}
