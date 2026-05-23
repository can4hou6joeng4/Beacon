import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { requireAdmin, updateUser } from "@/lib/auth"
import type { CreateUserInput, UserRole, UserStatus } from "@/lib/auth-types"

export const runtime = "nodejs"

type UpdatePayload = {
  name?: string
  role?: UserRole
  status?: UserStatus
  quota?: Partial<CreateUserInput["quota"]>
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(request)
    const { id } = await params
    const payload = (await request.json().catch(() => null)) as UpdatePayload | null
    const user = await updateUser(id, {
      name: payload?.name,
      role: payload?.role,
      status: payload?.status,
      quota: payload?.quota
        ? {
            uploadBytesLimit: payload.quota.uploadBytesLimit ?? 0,
            ocrJobsLimit: payload.quota.ocrJobsLimit ?? 0,
            ocrPagesLimit: payload.quota.ocrPagesLimit ?? 0,
          }
        : undefined,
    })
    return NextResponse.json({ user })
  } catch (error) {
    return jsonError(error, "更新用户失败")
  }
}
