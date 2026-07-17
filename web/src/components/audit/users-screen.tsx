"use client"

import { ChevronDown, LoaderCircle } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { formatBytes } from "@/components/audit/report-format"
import { Rise } from "@/components/audit/rise"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { CreateUserInput, PublicUser, UserRole, UserStatus } from "@/lib/auth-types"
import {
  BYTES_PER_MEGABYTE,
  DEFAULT_OCR_JOB_QUOTA,
  DEFAULT_OCR_PAGE_QUOTA,
  DEFAULT_UPLOAD_QUOTA_MB,
} from "@/lib/quota-limits"
import { cn } from "@/lib/utils"

type UsersPayload = {
  users?: PublicUser[]
  error?: string
}

type UserPayload = {
  user?: PublicUser
  error?: string
}

type CreateFormState = {
  username: string
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
  username: "",
  name: "",
  password: "",
  role: "user",
  uploadMb: String(DEFAULT_UPLOAD_QUOTA_MB),
  ocrJobs: String(DEFAULT_OCR_JOB_QUOTA),
  ocrPages: String(DEFAULT_OCR_PAGE_QUOTA),
}

function userToEdit(user: PublicUser): UserEditState {
  return {
    name: user.name,
    role: user.role,
    status: user.status,
    uploadMb: String(Math.floor(user.quota.quota.uploadBytesLimit / BYTES_PER_MEGABYTE)),
    ocrJobs: String(user.quota.quota.ocrJobsLimit),
    ocrPages: String(user.quota.quota.ocrPagesLimit),
  }
}

function numberFromInput(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function quotaFromStrings(input: { uploadMb: string; ocrJobs: string; ocrPages: string }): CreateUserInput["quota"] {
  return {
    uploadBytesLimit: numberFromInput(input.uploadMb) * BYTES_PER_MEGABYTE,
    ocrJobsLimit: numberFromInput(input.ocrJobs),
    ocrPagesLimit: numberFromInput(input.ocrPages),
  }
}

function UnderlineSelect({
  id,
  value,
  disabled,
  title,
  ariaLabel,
  options,
  onChange,
}: {
  id?: string
  value: string
  disabled?: boolean
  title?: string
  ariaLabel?: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <span className="relative inline-flex min-w-33">
      <select
        id={id}
        className="min-h-10.5 w-full cursor-pointer appearance-none border-0 border-b border-hair bg-transparent pr-6.5 pl-0.5 text-[14.5px] outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:shadow-[0_1px_0_0_var(--primary)] disabled:cursor-not-allowed disabled:text-faint"
        value={value}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-1 size-3.5 -translate-y-1/2 text-faint" />
    </span>
  )
}

function QuotaField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs tracking-[0.08em] text-faint">{label}</span>
      <input
        className="num min-h-10 w-27.5 border-0 border-b border-hair bg-transparent px-0.5 text-[15px] outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:shadow-[0_1px_0_0_var(--primary)]"
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

export function UsersScreen({ currentUser }: { currentUser: PublicUser }) {
  const [users, setUsers] = useState<PublicUser[]>([])
  const [edits, setEdits] = useState<Record<string, UserEditState>>({})
  const [form, setForm] = useState<CreateFormState>(DEFAULT_CREATE_FORM)
  const [isLoading, setIsLoading] = useState(true)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    void loadUsers()
  }, [])

  async function loadUsers() {
    setIsLoading(true)
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" })
      const payload = (await response.json().catch(() => ({ error: "读取用户失败" }))) as UsersPayload
      if (!response.ok) {
        toast.error(payload.error || "读取用户失败")
        return
      }
      const loaded = payload.users ?? []
      setUsers(loaded)
      setEdits(Object.fromEntries(loaded.map((user) => [user.id, userToEdit(user)])))
    } catch (loadError) {
      toast.error(loadError instanceof Error ? loadError.message : "读取用户失败")
    } finally {
      setIsLoading(false)
    }
  }

  const canCreate = form.username.trim().length > 0 && form.name.trim().length > 0

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canCreate || isCreating) return
    setIsCreating(true)
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          name: form.name,
          password: form.password,
          role: form.role,
          quota: quotaFromStrings(form),
        } satisfies CreateUserInput),
      })
      const payload = (await response.json().catch(() => ({ error: "创建用户失败" }))) as UserPayload
      if (!response.ok || !payload.user) {
        toast.error(payload.error || "创建用户失败")
        return
      }
      setForm(DEFAULT_CREATE_FORM)
      toast.success(`已创建用户 ${payload.user.name}`)
      await loadUsers()
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : "创建用户失败")
    } finally {
      setIsCreating(false)
    }
  }

  async function updateUser(user: PublicUser, patch: Partial<UserEditState> = {}) {
    const edit = { ...(edits[user.id] ?? userToEdit(user)), ...patch }
    if (!edit.name.trim()) {
      toast.error("名称不能为空")
      return
    }
    setBusyUserId(user.id)
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: edit.name,
          role: edit.role,
          status: edit.status,
          quota: quotaFromStrings(edit),
        }),
      })
      const payload = (await response.json().catch(() => ({ error: "更新用户失败" }))) as UserPayload
      if (!response.ok || !payload.user) {
        toast.error(payload.error || "更新用户失败")
        return
      }
      toast.success(`已保存 ${payload.user.name} 的设置`)
      await loadUsers()
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "更新用户失败")
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
    <main className="mx-auto w-full max-w-3xl px-5 pt-12 pb-24 sm:px-6 sm:pt-18 sm:pb-32">
      <Rise index={0}>
        <div className="font-latin text-[13px] font-medium tracking-[0.22em] uppercase text-primary">用户管理</div>
      </Rise>
      <Rise index={1} className="mt-3">
        <h1 className="text-[26px] font-bold leading-snug tracking-[0.01em]">成员与配额</h1>
      </Rise>
      <Rise index={2} className="mt-10">
        <section>
          <div className="flex items-center gap-2.5 border-b border-ink pb-2.5">
            <span className="block h-[3px] w-3 flex-none rounded-sm bg-primary"></span>
            <span className="text-[15px] font-semibold tracking-[0.08em]">新增用户</span>
          </div>
          <form onSubmit={createUser}>
            <div className="mt-5 grid grid-cols-1 gap-x-7 gap-y-6 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nu-username">账号</Label>
                <Input
                  id="nu-username"
                  value={form.username}
                  autoComplete="off"
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nu-name">名称</Label>
                <Input id="nu-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nu-pass">初始密码</Label>
                <Input
                  id="nu-pass"
                  type="password"
                  value={form.password}
                  autoComplete="new-password"
                  minLength={10}
                  required
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nu-role">角色</Label>
                <UnderlineSelect
                  id="nu-role"
                  value={form.role}
                  options={[
                    { value: "user", label: "普通用户" },
                    { value: "admin", label: "管理员" },
                  ]}
                  onChange={(value) => setForm({ ...form, role: value === "admin" ? "admin" : "user" })}
                />
              </div>
              <QuotaField label="上传上限 MB" value={form.uploadMb} onChange={(value) => setForm({ ...form, uploadMb: value })} />
              <QuotaField label="OCR 任务数" value={form.ocrJobs} onChange={(value) => setForm({ ...form, ocrJobs: value })} />
              <QuotaField label="OCR 页数" value={form.ocrPages} onChange={(value) => setForm({ ...form, ocrPages: value })} />
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-4.5">
              <Button type="submit" disabled={!canCreate || isCreating}>
                {isCreating ? (
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle className="size-4 animate-spin" />
                    创建中…
                  </span>
                ) : (
                  "创建用户"
                )}
              </Button>
              {!canCreate ? <span className="text-[13px] text-faint">填写账号与名称后即可创建</span> : null}
            </div>
          </form>
        </section>
      </Rise>
      <Rise index={3} className="mt-16">
        <div className="border-t border-ink">
          {isLoading && users.length === 0 ? (
            <div className="border-b border-hair px-0.5 py-4.5 text-[13.5px] text-faint">正在读取成员列表…</div>
          ) : (
            users.map((user) => {
              const edit = edits[user.id] ?? userToEdit(user)
              const isSelf = user.id === currentUser.id
              const disabled = edit.status === "disabled"
              const busy = busyUserId === user.id
              return (
                <div key={user.id} className="flex flex-col gap-4 border-b border-hair py-7">
                  <div className="flex flex-wrap items-baseline gap-3.5">
                    <input
                      className={cn(
                        "max-w-45 border-0 border-b border-transparent bg-transparent px-0.5 text-[17px] font-semibold outline-none transition-[border-color,box-shadow] hover:border-hair focus-visible:border-primary focus-visible:shadow-[0_1px_0_0_var(--primary)]",
                        disabled && "text-faint",
                      )}
                      value={edit.name}
                      aria-label="用户名称"
                      onChange={(event) => updateEdit(user.id, { name: event.target.value })}
                    />
                    <span className="num text-[13px] text-faint">
                      {user.username}
                      {isSelf ? " · 当前登录" : ""}
                    </span>
                    {disabled ? (
                      <span className="rounded-full border border-current px-2.5 text-xs leading-relaxed text-destructive">已禁用</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-7">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs tracking-[0.08em] text-faint">角色</span>
                      <UnderlineSelect
                        value={edit.role}
                        ariaLabel="角色"
                        options={[
                          { value: "admin", label: "管理员" },
                          { value: "user", label: "普通用户" },
                        ]}
                        onChange={(value) => updateEdit(user.id, { role: value === "admin" ? "admin" : "user" })}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs tracking-[0.08em] text-faint">状态</span>
                      <UnderlineSelect
                        value={edit.status}
                        disabled={isSelf}
                        title={isSelf ? "不能禁用当前登录账号" : undefined}
                        ariaLabel="状态"
                        options={[
                          { value: "active", label: "启用" },
                          { value: "disabled", label: "禁用" },
                        ]}
                        onChange={(value) => updateEdit(user.id, { status: value === "disabled" ? "disabled" : "active" })}
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-7">
                    <QuotaField label="上传上限 MB" value={edit.uploadMb} onChange={(value) => updateEdit(user.id, { uploadMb: value })} />
                    <QuotaField label="OCR 任务数" value={edit.ocrJobs} onChange={(value) => updateEdit(user.id, { ocrJobs: value })} />
                    <QuotaField label="OCR 页数" value={edit.ocrPages} onChange={(value) => updateEdit(user.id, { ocrPages: value })} />
                  </div>
                  <div className="num text-[13px] text-faint">
                    已用 {formatBytes(user.quota.usage.uploadBytes)} · {user.quota.usage.ocrJobs} 任务 · {user.quota.usage.ocrPages} 页
                  </div>
                  <div className="flex items-center gap-4.5">
                    <button
                      type="button"
                      className="inline-flex min-h-10 items-center gap-1.5 px-1 text-sm text-primary transition-colors hover:text-primary-press hover:underline hover:underline-offset-4 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => updateUser(user)}
                    >
                      {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                      保存
                    </button>
                    {!isSelf ? (
                      disabled ? (
                        <button
                          type="button"
                          className="inline-flex min-h-10 items-center px-1 text-sm text-ok transition-colors hover:underline hover:underline-offset-4 disabled:opacity-50"
                          disabled={busy}
                          onClick={() => updateUser(user, { status: "active" })}
                        >
                          启用
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex min-h-10 items-center px-1 text-sm text-destructive transition-colors hover:underline hover:underline-offset-4 disabled:opacity-50"
                          disabled={busy}
                          onClick={() => updateUser(user, { status: "disabled" })}
                        >
                          禁用
                        </button>
                      )
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Rise>
    </main>
  )
}
