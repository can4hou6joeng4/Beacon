import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-11 w-full min-w-0 rounded-none border-0 border-b border-hair bg-transparent px-0.5 py-1 text-base transition-[border-color,box-shadow] outline-none placeholder:text-faint focus-visible:border-primary focus-visible:shadow-[0_1px_0_0_var(--primary)] focus-visible:outline-none disabled:cursor-not-allowed disabled:text-faint aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
