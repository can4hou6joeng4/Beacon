"use client"

import { LogIn } from "lucide-react"
import { FormEvent, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ThemeToggle } from "@/components/theme-toggle"

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
    <main className="min-h-screen bg-[#f3f6f8] p-5 text-foreground dark:bg-background">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-5xl flex-col">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-[#176b87] text-sm font-black text-white">PDF</div>
            <div>
              <h1 className="text-base font-semibold">证件有效期审计</h1>
              <p className="text-xs text-muted-foreground">Cloudflare 云端审计工作台</p>
            </div>
          </div>
          <ThemeToggle />
        </header>

        <section className="grid flex-1 place-items-center py-10">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="mb-2 grid h-10 w-10 place-items-center rounded-lg bg-[#176b87] text-white">
                <LogIn className="h-5 w-5" />
              </div>
              <CardTitle>登录审计工作台</CardTitle>
            </CardHeader>
            <CardContent>
              {error ? (
                <Alert variant="destructive" className="mb-4">
                  <AlertTitle>登录失败</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="account">账号</Label>
                  <Input
                    id="account"
                    value={account}
                    onChange={(event) => setAccount(event.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">密码</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
                <Button className="w-full bg-[#176b87] hover:bg-[#145d75]" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "登录中" : "登录"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
