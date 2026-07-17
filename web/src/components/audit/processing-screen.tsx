"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * Full-screen processing scene: hairline progress track pinned to the top,
 * giant eased percentage, swapping status line, five step dots.
 * The displayed number chases `targetPercent` with the prototype's rAF easing
 * (`display += delta * 0.07`), jumping straight to the target when the user
 * prefers reduced motion.
 */
export function ProcessingScreen({
  filename,
  targetPercent,
  statusText,
  activeStep,
  done,
  failed,
  failureMessage,
  canExit,
  onExit,
}: {
  filename: string
  targetPercent: number
  statusText: string
  activeStep: number
  done: boolean
  failed: boolean
  failureMessage: string
  canExit: boolean
  onExit: () => void
}) {
  const [shown, setShown] = useState(0)
  const displayRef = useRef(0)
  const targetRef = useRef(targetPercent)

  useEffect(() => {
    targetRef.current = targetPercent
  }, [targetPercent])

  useEffect(() => {
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let raf = 0
    const tick = () => {
      const target = targetRef.current
      let display = displayRef.current
      if (reduce) {
        display = target
      } else {
        const delta = target - display
        display = delta <= 0.4 ? target : display + delta * 0.07
      }
      displayRef.current = display
      const next = Math.floor(display + 0.0001)
      setShown((prev) => (prev === next ? prev : next))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-10 text-center">
      <div className="fixed inset-x-0 top-0 z-60 h-0.5 bg-sunken" aria-hidden="true">
        <div
          className={cn("h-full transition-[width] duration-250 ease-linear", failed ? "bg-destructive" : "bg-primary")}
          style={{ width: `${shown}%` }}
        ></div>
      </div>
      <div className="animate-rise mb-12 text-[13px] tracking-[0.06em] text-faint break-all">正在检查 · {filename}</div>
      <div
        className="animate-rise num flex items-baseline justify-center text-[clamp(96px,15vw,120px)] font-bold leading-none tracking-[-0.045em]"
        style={{ animationDelay: "70ms", color: failed ? "var(--destructive)" : "var(--primary)" }}
        aria-live="polite"
      >
        <span>{shown}</span>
        <span className="ml-2 text-[34px] font-medium tracking-normal opacity-55">%</span>
      </div>
      <div className="animate-rise mt-7 min-h-7 max-w-xl text-base" style={{ animationDelay: "130ms" }}>
        <span key={failed ? failureMessage : statusText} className={cn("animate-swap inline-block", failed ? "text-destructive" : "text-muted-foreground")}>
          {failed ? failureMessage || "检查失败" : statusText}
        </span>
      </div>
      <div className="animate-rise mt-11 flex gap-3.5" style={{ animationDelay: "190ms" }} aria-label={`第 ${activeStep} / 5 步`}>
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={cn(
              "size-2 rounded-full bg-hair transition-colors duration-300",
              (done || step < activeStep) && "bg-primary",
              step === activeStep && !done && (failed ? "bg-destructive" : "animate-dot-pulse bg-primary"),
            )}
          ></span>
        ))}
      </div>
      <button
        type="button"
        className={cn(
          "animate-rise mt-16 min-h-10 px-4 text-sm text-faint transition-colors hover:text-foreground hover:underline hover:underline-offset-4",
          (done || (!canExit && !failed)) && "invisible",
        )}
        style={{ animationDelay: "250ms" }}
        onClick={onExit}
      >
        {failed ? "返回" : "转入后台"}
      </button>
    </main>
  )
}
