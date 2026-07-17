import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-colors outline-none select-none disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "min-h-12 gap-2 rounded-lg bg-primary px-7 text-[15px] font-semibold tracking-[0.02em] text-primary-foreground hover:bg-primary-press active:translate-y-px disabled:bg-sunken disabled:text-faint",
        hairline:
          "min-h-12 gap-2 rounded-lg border border-hair bg-transparent px-7 text-[15px] font-medium tracking-[0.02em] hover:border-ink disabled:opacity-50",
        text: "min-h-10 gap-1.5 px-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
