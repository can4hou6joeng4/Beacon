"use client"

import { CheckCircle2, RefreshCw, Save, UserPlus, XCircle } from "lucide-react"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CreateUserInput, PublicUser, UserRole, UserStatus } from "@/lib/auth-types"

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
  uploadMb: "1024",
  ocrJobs: "25",
  ocrPages: "2000",
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
            <div className="grid gap-2">
              <Label htmlFor="admin-upload">上传 MB</Label>
              <Input id="admin-upload" type="number" min={0} value={form.uploadMb} onChange={(event) => setForm({ ...form, uploadMb: event.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="admin-jobs">OCR 任务</Label>
              <Input id="admin-jobs" type="number" min={0} value={form.ocrJobs} onChange={(event) => setForm({ ...form, ocrJobs: event.target.value })} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-pages">OCR 页</Label>
              <Input id="admin-pages" type="number" min={0} value={form.ocrPages} onChange={(event) => setForm({ ...form, ocrPages: event.target.value })} required />
            </div>
          </div>
          <Button type="submit" className="bg-[#176b87] hover:bg-[#145d75]" disabled={isCreating}>
            <UserPlus className="h-4 w-4" />
            {isCreating ? "创建中" : "创建"}
          </Button>
        </div>
      </form>

      <div className="rounded-md border bg-background dark:bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户</TableHead>
              <TableHead>额度</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const edit = edits[user.id] ?? userToEdit(user)
              const isSelf = user.id === currentUser.id
              return (
                <TableRow key={user.id}>
                  <TableCell className="min-w-44 align-top">
                    <div className="space-y-2">
                      <Input value={edit.name} onChange={(event) => updateEdit(user.id, { name: event.target.value })} />
                      <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                      <div className="flex items-center gap-2">
                        <Badge variant={user.status === "active" ? "secondary" : "destructive"}>{user.status === "active" ? "active" : "disabled"}</Badge>
                        <select
                          className="h-8 rounded-md border bg-background px-2 text-xs"
                          value={edit.role}
                          onChange={(event) => updateEdit(user.id, { role: event.target.value === "admin" ? "admin" : "user" })}
                        >
                          <option value="user">用户</option>
                          <option value="admin">管理员</option>
                        </select>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-44 align-top">
                    <div className="grid gap-2">
                      <LabeledInlineInput label="MB" value={edit.uploadMb} onChange={(value) => updateEdit(user.id, { uploadMb: value })} />
                      <LabeledInlineInput label="Jobs" value={edit.ocrJobs} onChange={(value) => updateEdit(user.id, { ocrJobs: value })} />
                      <LabeledInlineInput label="Pages" value={edit.ocrPages} onChange={(value) => updateEdit(user.id, { ocrPages: value })} />
                      <div className="text-xs text-muted-foreground">
                        已用 {formatBytes(user.quota.usage.uploadBytes)} · {user.quota.usage.ocrJobs} job · {user.quota.usage.ocrPages} 页
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="align-top text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="icon-sm" variant="outline" disabled={busyUserId === user.id} onClick={() => updateUser(user)}>
                        <Save className="h-4 w-4" />
                        <span className="sr-only">保存</span>
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant={user.status === "active" ? "destructive" : "outline"}
                        disabled={busyUserId === user.id || isSelf}
                        onClick={() => updateUser(user, { status: user.status === "active" ? "disabled" : "active" })}
                      >
                        {user.status === "active" ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        <span className="sr-only">{user.status === "active" ? "禁用" : "启用"}</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function LabeledInlineInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-2 text-xs text-muted-foreground">
      <span>{label}</span>
      <Input className="h-8" type="number" min={0} value={value} onChange={(event) => onChange(event.target.value)} />
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
  return numberFromInput(value) * 1024 * 1024
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
