import { describe, expect, it } from "vitest"
import { staleCloudUploadSessionError } from "../cloud-upload-errors"

describe("staleCloudUploadSessionError", () => {
  it("returns actionable conflict errors for stale Worker upload sessions", () => {
    expect(staleCloudUploadSessionError("failed", false)).toMatchObject({
      status: 409,
      code: "UPLOAD_SESSION_FAILED",
      message: expect.stringContaining("请重新选择 PDF"),
    })

    expect(staleCloudUploadSessionError("complete", false)).toMatchObject({
      status: 409,
      code: "UPLOAD_SESSION_COMPLETED",
      message: expect.stringContaining("请发起新的检查任务"),
    })

    expect(staleCloudUploadSessionError("queued", true)).toMatchObject({
      status: 409,
      code: "UPLOAD_ALREADY_SUBMITTED",
      message: expect.stringContaining("不能重复上传"),
    })

    expect(staleCloudUploadSessionError("queued", false)).toMatchObject({
      status: 409,
      code: "UPLOAD_SESSION_STALE",
      message: expect.stringContaining("上传会话已不可用"),
    })
  })
})
