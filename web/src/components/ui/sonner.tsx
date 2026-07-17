"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--ink)",
          "--normal-text": "#fafaf7",
          "--normal-border": "transparent",
          "--border-radius": "999px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
        style: {
          padding: "12px 24px",
          boxShadow: "0 8px 24px rgb(22 24 29 / 0.18)",
          fontSize: "14px",
          justifyContent: "center",
          width: "fit-content",
          marginInline: "auto",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
