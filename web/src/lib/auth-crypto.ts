export const PASSWORD_ITERATIONS = 100_000
const TOKEN_BYTES = 32

export type PasswordHash = {
  hash: string
  salt: string
  iterations: number
}

export function generateSessionToken(): string {
  return randomBase64Url(TOKEN_BYTES)
}

export function generateSalt(): string {
  return randomBase64Url(16)
}

export async function hashPassword(password: string, salt = generateSalt(), iterations = PASSWORD_ITERATIONS): Promise<PasswordHash> {
  const key = await importPasswordKey(password)
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations,
      hash: "SHA-256",
    },
    key,
    256,
  )
  return {
    hash: bufferToBase64Url(derived),
    salt,
    iterations,
  }
}

export async function verifyPassword(input: {
  password: string
  hash: string
  salt: string
  iterations: number
}): Promise<boolean> {
  const candidate = await hashPassword(input.password, input.salt, input.iterations)
  return timingSafeEqual(candidate.hash, input.hash)
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  return bufferToHex(digest)
}

export function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return result === 0
}

async function importPasswordKey(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64url")
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString("base64url")
}
