"use client"

import { cn } from "@/lib/utils"

/**
 * Staggered rise-in container from the Design C prototype: each block fades
 * up 12px with a 60ms-per-index delay when its screen mounts.
 */
export function Rise({
  index = 0,
  className,
  children,
}: {
  index?: number
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("animate-rise", className)} style={{ animationDelay: `${index * 60}ms` }}>
      {children}
    </div>
  )
}
