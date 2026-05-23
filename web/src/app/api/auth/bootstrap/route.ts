import { NextResponse } from "next/server"
import { jsonError } from "@/lib/api-response"
import { bootstrapAdmin, verifyBootstrapRequest } from "@/lib/auth"
import type { CreateUserInput } from "@/lib/auth-types"
import { DEFAULT_OCR_JOB_QUOTA, DEFAULT_OCR_PAGE_QUOTA, DEFAULT_UPLOAD_QUOTA_BYTES } from "@/lib/quota-limits"

export const runtime = "nodejs"

type BootstrapPayload = {
  email?: string
  name?: string
  password?: string
  token?: string
  quota?: Partial<CreateUserInput["quota"]>
}

const DEFAULT_ADMIN_QUOTA: CreateUserInput["quota"] = {
  uploadBytesLimit: DEFAULT_UPLOAD_QUOTA_BYTES,
  ocrJobsLimit: DEFAULT_OCR_JOB_QUOTA,
  ocrPagesLimit: DEFAULT_OCR_PAGE_QUOTA,
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => null)) as BootstrapPayload | null
    verifyBootstrapRequest(request, payload?.token)
    const user = await bootstrapAdmin({
      email: payload?.email || "",
      name: payload?.name || "Admin",
      password: payload?.password || "",
      quota: {
        uploadBytesLimit: payload?.quota?.uploadBytesLimit ?? DEFAULT_ADMIN_QUOTA.uploadBytesLimit,
        ocrJobsLimit: payload?.quota?.ocrJobsLimit ?? DEFAULT_ADMIN_QUOTA.ocrJobsLimit,
        ocrPagesLimit: payload?.quota?.ocrPagesLimit ?? DEFAULT_ADMIN_QUOTA.ocrPagesLimit,
      },
    })
    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    return jsonError(error, "初始化管理员失败")
  }
}
