import { describe, expect, it } from "vitest"
import { resultDistribution, stageFromStatus } from "../audit-progress"

describe("stageFromStatus", () => {
  it("maps queued to upload stage", () => {
    expect(stageFromStatus({ status: "queued", message: "任务已创建" })).toEqual({
      activeStep: 1,
      failed: false,
      complete: false,
      label: "任务已创建",
    })
  })

  it("maps running to OCR stage with indeterminate progress", () => {
    expect(stageFromStatus({ status: "running", message: "正在解析 PDF 书签并执行 OCR" })).toEqual({
      activeStep: 3,
      failed: false,
      complete: false,
      label: "正在解析 PDF 书签并执行 OCR",
    })
  })

  it("maps complete to finished stage", () => {
    expect(stageFromStatus({ status: "complete", message: "检查完成" })).toEqual({
      activeStep: 5,
      failed: false,
      complete: true,
      label: "检查完成",
    })
  })

  it("maps failed to failed current stage", () => {
    expect(stageFromStatus({ status: "failed", message: "OCR 处理失败" })).toEqual({
      activeStep: 3,
      failed: true,
      complete: false,
      label: "OCR 处理失败",
    })
  })
})

describe("resultDistribution", () => {
  it("calculates valid unflagged candidates without going below zero", () => {
    expect(
      resultDistribution({
        pages_ocr: 184,
        ocr_error_pages: 0,
        ocr_total_pages: 184,
        validity_candidates: 84,
        matches: 0,
        near_expiry: 0,
        needs_review: 3,
        cutoff: "2026-05-07",
      }),
    ).toEqual([
      { name: "早于截止", value: 0, kind: "danger" },
      { name: "临近到期", value: 0, kind: "warning" },
      { name: "需要复核", value: 3, kind: "review" },
      { name: "有效", value: 81, kind: "ok" },
    ])
  })
})
