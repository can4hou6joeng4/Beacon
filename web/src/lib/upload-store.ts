import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

export const UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000

type UploadMetadata = {
  id: string
  filename: string
  size: number
  contentType: string
  createdAt: string
}

export function createUpload(input: { filename: string; size: number; contentType?: string }) {
  cleanupStaleUploads()
  const id = randomUUID()
  const dir = uploadDir(id)
  mkdirSync(chunksDir(id), { recursive: true })
  const metadata: UploadMetadata = {
    id,
    filename: input.filename,
    size: input.size,
    contentType: input.contentType || "application/pdf",
    createdAt: new Date().toISOString(),
  }
  writeFileSync(join(dir, "metadata.json"), JSON.stringify(metadata, null, 2))
  return { uploadId: id, chunkSize: UPLOAD_CHUNK_SIZE }
}

export function writeUploadChunk(uploadId: string, index: number, content: Buffer) {
  assertSafeUploadId(uploadId)
  if (!Number.isInteger(index) || index < 0) throw new Error("无效的分片序号")
  const dir = chunksDir(uploadId)
  if (!existsSync(dir)) throw new Error("上传会话不存在")
  writeFileSync(join(dir, `${index}.part`), content)
}

export function completeUpload(uploadId: string, totalChunks: number) {
  assertSafeUploadId(uploadId)
  if (!Number.isInteger(totalChunks) || totalChunks < 1) throw new Error("无效的分片数量")
  const metadata = readMetadata(uploadId)
  const chunks = Array.from({ length: totalChunks }, (_, index) => join(chunksDir(uploadId), `${index}.part`))
  const missing = chunks.find((path) => !existsSync(path))
  if (missing) throw new Error("上传分片不完整，请重新上传")
  const size = chunks.reduce((total, path) => total + statSync(path).size, 0)
  if (metadata.size > 0 && size !== metadata.size) throw new Error("上传文件大小校验失败，请重新上传")
  return {
    metadata,
    blob: new Blob(chunks.map((path) => readFileSync(path)), { type: metadata.contentType }),
    cleanup: () => rmSync(uploadDir(uploadId), { recursive: true, force: true }),
  }
}

export function cleanupUpload(uploadId: string) {
  assertSafeUploadId(uploadId)
  rmSync(uploadDir(uploadId), { recursive: true, force: true })
}

function uploadsRoot() {
  if (process.env.AUDIT_UPLOAD_DIR) return resolve(process.env.AUDIT_UPLOAD_DIR)
  return join(/*turbopackIgnore: true*/ process.cwd(), "data", "uploads")
}

function uploadDir(uploadId: string) {
  assertSafeUploadId(uploadId)
  const root = uploadsRoot()
  mkdirSync(root, { recursive: true })
  return join(root, uploadId)
}

function chunksDir(uploadId: string) {
  return join(uploadDir(uploadId), "chunks")
}

function readMetadata(uploadId: string) {
  const path = join(uploadDir(uploadId), "metadata.json")
  if (!existsSync(path)) throw new Error("上传会话不存在")
  return JSON.parse(readFileSync(path, "utf-8")) as UploadMetadata
}

function assertSafeUploadId(uploadId: string) {
  if (!/^[0-9a-f-]{36}$/.test(uploadId)) throw new Error("无效的上传会话")
}

function cleanupStaleUploads() {
  const root = uploadsRoot()
  if (!existsSync(root)) return
  const now = Date.now()
  for (const name of readdirSync(root)) {
    const dir = join(root, name)
    try {
      if (now - statSync(dir).mtimeMs > UPLOAD_TTL_MS) {
        rmSync(dir, { recursive: true, force: true })
      }
    } catch {
      // Ignore concurrent cleanup races.
    }
  }
}
