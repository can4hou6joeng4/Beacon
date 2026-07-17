"use client"

import { LoaderCircle } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Rise } from "@/components/audit/rise"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type LoginResponse = {
  error?: string
}

export function SignInPanel() {
  const [account, setAccount] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError("")
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: account, password }),
      })
      const payload = (await response.json().catch(() => ({}))) as LoginResponse
      if (!response.ok) {
        setError(payload.error || "登录失败")
        return
      }
      window.location.reload()
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登录失败")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form className="flex w-full max-w-90 flex-col gap-7 pb-[8vh]" onSubmit={handleSubmit}>
        <Rise index={0} className="mb-3">
          <h1 className="text-3xl font-bold tracking-[0.04em]">有效期检查</h1>
          <div className="font-latin mt-2 text-[11px] font-medium tracking-[0.42em] text-primary">EXPIRY AUDIT</div>
        </Rise>
        <Rise index={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-account">账号</Label>
            <Input
              id="login-account"
              value={account}
              autoComplete="username"
              autoFocus
              onChange={(event) => setAccount(event.target.value)}
              required
            />
          </div>
        </Rise>
        <Rise index={2}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="login-password">密码</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
        </Rise>
        {error ? (
          <p className="animate-swap text-center text-[13px] text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Rise index={3}>
          <Button className="w-full" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircle className="size-4 animate-spin" />
                正在进入…
              </span>
            ) : (
              "进入"
            )}
          </Button>
        </Rise>
      </form>
    </main>
  )
}
