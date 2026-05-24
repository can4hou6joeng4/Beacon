import { analyzePaddleOcrJsonl } from "./audit-analyzer"
import type { AuditDb } from "./audit-db"
import { resultDistribution } from "./audit-python"
import type { AuditHistoryJob, AuditResult } from "./audit-types"
import { AppError } from "./app-error"
import {
  createCloudObjectStoreConfig,
  fetchCloudObjectText,
  putCloudObjectText,
  siblingObjectKey,
  type CloudObjectStoreConfig,
  type R2BucketLike,
} from "./cloud-object-store"

export type AuditReanalysisResult = {
  job: AuditHistoryJob
  result: AuditResult
  distribution: ReturnType<typeof resultDistribution>
}

export async function reanalyzePaddleOcrJobArtifacts(input: {
  db: AuditDb
  job: AuditHistoryJob
  config?: CloudObjectStoreConfig
  bucket?: R2BucketLike
}): Promise<AuditReanalysisResult> {
  if (input.job.runtime !== "paddleocr") {
    throw new AppError("仅支持重新分析云端 PaddleOCR 历史任务", {
      status: 409,
      code: "REANALYZE_UNSUPPORTED_RUNTIME",
    })
  }
  if (input.job.status !== "complete") {
    throw new AppError("仅支持重新分析已完成的历史任务", {
      status: 409,
      code: "REANALYZE_JOB_NOT_COMPLETE",
    })
  }
  if (!input.job.objectKey) {
    throw new AppError("云端任务缺少对象路径", {
      status: 404,
      code: "REANALYZE_OBJECT_KEY_MISSING",
    })
  }

  const config = input.config ?? createCloudObjectStoreConfig()
  const rawKey = siblingObjectKey({ objectKey: input.job.objectKey, filename: "paddleocr.jsonl", prefix: config.prefix })
  const resultKey = siblingObjectKey({ objectKey: input.job.objectKey, filename: "result.json", prefix: config.prefix })
  const ocrKey = siblingObjectKey({ objectKey: input.job.objectKey, filename: "ocr.txt", prefix: config.prefix })
  const csvKey = siblingObjectKey({ objectKey: input.job.objectKey, filename: "matches.csv", prefix: config.prefix })

  const jsonl = await fetchPaddleOcrJsonlArtifact({ objectKey: rawKey, config, bucket: input.bucket })
  const analyzed = analyzePaddleOcrJsonl({ jobId: input.job.id, cutoff: input.job.cutoff, jsonl })

  await Promise.all([
    putCloudObjectText({
      objectKey: ocrKey,
      content: analyzed.ocrText,
      contentType: "text/plain; charset=utf-8",
      config,
      bucket: input.bucket,
    }),
    putCloudObjectText({
      objectKey: csvKey,
      content: analyzed.csv,
      contentType: "text/csv; charset=utf-8",
      config,
      bucket: input.bucket,
    }),
    putCloudObjectText({
      objectKey: resultKey,
      content: JSON.stringify(analyzed.result, null, 2),
      contentType: "application/json; charset=utf-8",
      config,
      bucket: input.bucket,
    }),
  ])

  const updated = await input.db.updateFromResult(input.job.id, analyzed.result.summary)
  if (!updated) {
    throw new AppError("任务不存在", {
      status: 404,
      code: "AUDIT_JOB_NOT_FOUND",
    })
  }

  return {
    job: updated,
    result: analyzed.result,
    distribution: resultDistribution(analyzed.result.summary),
  }
}

async function fetchPaddleOcrJsonlArtifact(input: {
  objectKey: string
  config: CloudObjectStoreConfig
  bucket?: R2BucketLike
}): Promise<string> {
  try {
    return await fetchCloudObjectText(input)
  } catch (error) {
    if (isMissingArtifactError(error)) {
      throw new AppError("历史记录缺少 PaddleOCR 原始结果，无法重新分析", {
        status: 404,
        code: "PADDLEOCR_JSONL_ARTIFACT_MISSING",
      })
    }
    throw error
  }
}

function isMissingArtifactError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message === "Object artifact not found" || error.message.includes("Object artifact download failed: 404")
}
