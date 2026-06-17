import { AppError } from "./app-error"

export function staleCloudUploadSessionError(status: string, hasProviderJob: boolean): AppError {
  if (status === "failed") {
    return new AppError("这次上传会话已经失败，系统已回退上传额度。请重新选择 PDF 发起新的检查。", {
      status: 409,
      code: "UPLOAD_SESSION_FAILED",
    })
  }
  if (status === "complete") {
    return new AppError("这个检查任务已经完成，不能继续上传 PDF。请发起新的检查任务。", {
      status: 409,
      code: "UPLOAD_SESSION_COMPLETED",
    })
  }
  if (hasProviderJob) {
    return new AppError("PDF 已经提交给 PaddleOCR 解析，不能重复上传。请在任务进度中查看结果。", {
      status: 409,
      code: "UPLOAD_ALREADY_SUBMITTED",
    })
  }
  return new AppError("这个上传会话已不可用，请重新选择 PDF 发起新的检查。", {
    status: 409,
    code: "UPLOAD_SESSION_STALE",
  })
}
