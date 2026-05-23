"use client"

import { Users } from "lucide-react"
import { useState } from "react"
import { AdminUserPanel } from "@/components/audit/admin-user-panel"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { PublicUser } from "@/lib/auth-types"

export function AdminUserDialog({ currentUser }: { currentUser: PublicUser }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" variant="outline" className="h-9" onClick={() => setOpen(true)}>
        <Users className="h-4 w-4" />
        用户管理
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>用户管理</DialogTitle>
            <DialogDescription>创建用户、配置角色状态，并调整上传与 OCR 额度。</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-5 pb-5">
            {open ? <AdminUserPanel currentUser={currentUser} /> : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
