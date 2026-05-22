import { createHash, createHmac, randomUUID } from "node:crypto"
import { extname } from "node:path"

export type CloudObjectStoreDriver = "local" | "r2-s3"

export type CloudObjectStoreConfig = {
  driver: CloudObjectStoreDriver
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  prefix: string
  uploadExpiresSeconds: number
  downloadExpiresSeconds: number
}

export type PresignedObjectUrl = {
  objectKey: string
  url: string
  expiresAt: string
}

type Env = Record<string, string | undefined>

type PresignInput = {
  method: "GET" | "PUT"
  objectKey: string
  contentType?: string
  config: CloudObjectStoreConfig
  expiresSeconds: number
  now?: Date
}

const DEFAULT_REGION = "auto"
const DEFAULT_PREFIX = "jobs"
const DEFAULT_UPLOAD_EXPIRES_SECONDS = 15 * 60
const DEFAULT_DOWNLOAD_EXPIRES_SECONDS = 60 * 60
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

export function createCloudObjectStoreConfig(env: Env = process.env): CloudObjectStoreConfig {
  const driver = parseDriver(env.AUDIT_OBJECT_STORE_DRIVER)
  return {
    driver,
    endpoint: trimTrailingSlash(env.AUDIT_OBJECT_STORE_ENDPOINT || ""),
    bucket: env.AUDIT_OBJECT_BUCKET || "",
    region: env.AUDIT_OBJECT_REGION || DEFAULT_REGION,
    accessKeyId: env.AUDIT_OBJECT_ACCESS_KEY_ID || "",
    secretAccessKey: env.AUDIT_OBJECT_SECRET_ACCESS_KEY || "",
    prefix: normalizePrefix(env.AUDIT_OBJECT_PREFIX || DEFAULT_PREFIX),
    uploadExpiresSeconds: parsePositiveInt(env.AUDIT_OBJECT_UPLOAD_EXPIRES_SECONDS, DEFAULT_UPLOAD_EXPIRES_SECONDS),
    downloadExpiresSeconds: parsePositiveInt(env.AUDIT_OBJECT_DOWNLOAD_EXPIRES_SECONDS, DEFAULT_DOWNLOAD_EXPIRES_SECONDS),
  }
}

export function validateCloudUploadInput(input: { filename?: string; size?: number; contentType?: string }) {
  if (!input.filename || !input.size || input.size < 1) {
    throw new Error("缺少上传文件信息")
  }
  if (!input.filename.toLowerCase().endsWith(".pdf")) {
    throw new Error("请上传 PDF 文件")
  }
  if (input.size > MAX_UPLOAD_BYTES) {
    throw new Error("PDF 文件超过当前 100MB 上传限制")
  }
  return {
    filename: input.filename,
    size: input.size,
    contentType: input.contentType || "application/pdf",
  }
}

export function generateAuditObjectKey(input: { filename: string; prefix: string; jobId?: string }): string {
  const extension = extname(input.filename).toLowerCase() || ".pdf"
  const jobId = input.jobId || randomUUID()
  return `${normalizePrefix(input.prefix)}/${jobId}/input${extension}`
}

export function createPresignedPutUrl(input: {
  objectKey: string
  contentType: string
  config: CloudObjectStoreConfig
  now?: Date
}): PresignedObjectUrl {
  const url = createPresignedObjectUrl({
    method: "PUT",
    objectKey: input.objectKey,
    contentType: input.contentType,
    config: input.config,
    expiresSeconds: input.config.uploadExpiresSeconds,
    now: input.now,
  })
  return {
    objectKey: input.objectKey,
    url,
    expiresAt: expiresAt(input.now, input.config.uploadExpiresSeconds),
  }
}

export function createPresignedGetUrl(input: {
  objectKey: string
  config: CloudObjectStoreConfig
  now?: Date
}): PresignedObjectUrl {
  const url = createPresignedObjectUrl({
    method: "GET",
    objectKey: input.objectKey,
    config: input.config,
    expiresSeconds: input.config.downloadExpiresSeconds,
    now: input.now,
  })
  return {
    objectKey: input.objectKey,
    url,
    expiresAt: expiresAt(input.now, input.config.downloadExpiresSeconds),
  }
}

export async function putCloudObjectText(input: {
  objectKey: string
  content: string
  contentType: string
  config: CloudObjectStoreConfig
  fetcher?: typeof fetch
}): Promise<void> {
  const upload = createPresignedPutUrl({
    objectKey: input.objectKey,
    contentType: input.contentType,
    config: input.config,
  })
  const fetcher = input.fetcher ?? fetch
  const response = await fetcher(upload.url, {
    method: "PUT",
    headers: { "Content-Type": input.contentType },
    body: input.content,
  })
  if (!response.ok) {
    throw new Error(`Object artifact upload failed: ${response.status}`)
  }
}

export async function fetchCloudObjectText(input: {
  objectKey: string
  config: CloudObjectStoreConfig
  fetcher?: typeof fetch
}): Promise<string> {
  const download = createPresignedGetUrl({ objectKey: input.objectKey, config: input.config })
  const fetcher = input.fetcher ?? fetch
  const response = await fetcher(download.url, { method: "GET" })
  if (!response.ok) {
    throw new Error(`Object artifact download failed: ${response.status}`)
  }
  return response.text()
}

export function siblingObjectKey(input: { objectKey: string; filename: string; prefix: string }): string {
  assertSafeObjectKey(input.objectKey, input.prefix)
  const parts = input.objectKey.split("/")
  parts[parts.length - 1] = input.filename
  return parts.join("/")
}

export function assertObjectStoreConfigured(config: CloudObjectStoreConfig): void {
  if (config.driver !== "r2-s3") {
    throw new Error("Cloud upload requires AUDIT_OBJECT_STORE_DRIVER=r2-s3")
  }
  const missing = [
    ["AUDIT_OBJECT_STORE_ENDPOINT", config.endpoint],
    ["AUDIT_OBJECT_BUCKET", config.bucket],
    ["AUDIT_OBJECT_ACCESS_KEY_ID", config.accessKeyId],
    ["AUDIT_OBJECT_SECRET_ACCESS_KEY", config.secretAccessKey],
  ].filter(([, value]) => !value)
  if (missing.length > 0) {
    throw new Error(`Missing object storage configuration: ${missing.map(([key]) => key).join(", ")}`)
  }
}

export function assertSafeObjectKey(objectKey: string, prefix: string): void {
  const normalizedPrefix = `${normalizePrefix(prefix)}/`
  if (!objectKey.startsWith(normalizedPrefix)) {
    throw new Error("对象存储路径不属于当前审计前缀")
  }
  if (objectKey.includes("..") || objectKey.startsWith("/") || objectKey.includes("\\")) {
    throw new Error("对象存储路径不安全")
  }
}

function createPresignedObjectUrl(input: PresignInput): string {
  assertObjectStoreConfigured(input.config)
  assertSafeObjectKey(input.objectKey, input.config.prefix)

  const now = input.now || new Date()
  const amzDate = formatAmzDate(now)
  const dateStamp = amzDate.slice(0, 8)
  const host = hostFromEndpoint(input.config.endpoint)
  const encodedPath = `/${encodePathSegment(input.config.bucket)}/${encodeObjectKey(input.objectKey)}`
  const credentialScope = `${dateStamp}/${input.config.region}/s3/aws4_request`
  const signedHeaders = "host"
  const query: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${input.config.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(input.expiresSeconds)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ]
  if (input.method === "PUT" && input.contentType) {
    query.push(["response-content-type", input.contentType])
  }
  const canonicalQuery = canonicalQueryString(query)
  const canonicalRequest = [
    input.method,
    encodedPath,
    canonicalQuery,
    `host:${host}\n`,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n")
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n")
  const signingKey = getSigningKey(input.config.secretAccessKey, dateStamp, input.config.region)
  const signature = hmacHex(signingKey, stringToSign)
  return `${input.config.endpoint}${encodedPath}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

function parseDriver(value: string | undefined): CloudObjectStoreDriver {
  if (!value || value === "local") return "local"
  if (value === "r2-s3") return "r2-s3"
  throw new Error("AUDIT_OBJECT_STORE_DRIVER must be local or r2-s3")
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function normalizePrefix(value: string): string {
  return value.replace(/^\/+|\/+$/g, "") || DEFAULT_PREFIX
}

function expiresAt(now: Date | undefined, expiresSeconds: number): string {
  return new Date((now || new Date()).getTime() + expiresSeconds * 1000).toISOString()
}

function hostFromEndpoint(endpoint: string): string {
  return new URL(endpoint).host
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "")
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value)
}

function encodeObjectKey(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/")
}

function canonicalQueryString(query: Array<[string, string]>): string {
  return query
    .map(([key, value]) => [encodeURIComponent(key), encodeURIComponent(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&")
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest()
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex")
}

function getSigningKey(secretAccessKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const dateRegionKey = hmac(dateKey, region)
  const dateRegionServiceKey = hmac(dateRegionKey, "s3")
  return hmac(dateRegionServiceKey, "aws4_request")
}
