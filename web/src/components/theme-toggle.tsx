"use client"

import { Laptop, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const options = [
  { value: "light", label: "浅色", icon: Sun },
  { value: "dark", label: "深色", icon: Moon },
  { value: "system", label: "系统", icon: Laptop },
] as const

function useMounted() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  )
}

export function ThemeToggle() {
  const mounted = useMounted()
  const { theme = "system", setTheme } = useTheme()
  const activeTheme = mounted ? theme : "system"

  return (
    <div className="inline-flex h-9 items-center rounded-lg border bg-background p-0.5 shadow-sm dark:border-input dark:bg-input/20" aria-label="主题切换">
      {options.map((option) => {
        const Icon = option.icon
        const active = activeTheme === option.value
        return (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground hover:text-foreground",
              active && "bg-muted text-foreground dark:bg-background/70",
            )}
            aria-pressed={active}
            onClick={() => setTheme(option.value)}
          >
            <Icon className="h-3.5 w-3.5" />
            {option.label}
          </Button>
        )
      })}
    </div>
  )
}
