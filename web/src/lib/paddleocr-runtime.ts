import { getCloudflareContext } from "@opennextjs/cloudflare"
import { createPaddleOcrConfig, type PaddleOcrConfig } from "./paddleocr"

type PaddleOcrRuntimeEnv = Record<string, string | undefined>

export async function createPaddleOcrRuntimeConfig(): Promise<PaddleOcrConfig> {
  const env = await getCloudflareRuntimeEnv()
  return createPaddleOcrConfig(env ?? process.env)
}

async function getCloudflareRuntimeEnv(): Promise<PaddleOcrRuntimeEnv | null> {
  if (process.env.NODE_ENV === "test") return null
  try {
    const context = await getCloudflareContext({ async: true })
    const env = context.env as unknown as PaddleOcrRuntimeEnv
    return {
      PADDLEOCR_API_BASE_URL: env.PADDLEOCR_API_BASE_URL,
      PADDLEOCR_API_TOKEN: env.PADDLEOCR_API_TOKEN,
      PADDLEOCR_MODEL: env.PADDLEOCR_MODEL,
      PADDLEOCR_POLL_INTERVAL_MS: env.PADDLEOCR_POLL_INTERVAL_MS,
      PADDLEOCR_USE_DOC_ORIENTATION_CLASSIFY: env.PADDLEOCR_USE_DOC_ORIENTATION_CLASSIFY,
      PADDLEOCR_USE_DOC_UNWARPING: env.PADDLEOCR_USE_DOC_UNWARPING,
      PADDLEOCR_USE_CHART_RECOGNITION: env.PADDLEOCR_USE_CHART_RECOGNITION,
    }
  } catch {
    return null
  }
}
