import { describe, expect, it } from "vitest"
import { PASSWORD_ITERATIONS, generateSalt, generateSessionToken, hashPassword, hashToken, timingSafeEqual, verifyPassword } from "../auth-crypto"

describe("auth crypto", () => {
  it("hashes passwords with PBKDF2 and verifies without storing plaintext", async () => {
    const password = "correct-horse-battery-staple"
    const salt = generateSalt()
    const hashed = await hashPassword(password, salt, 1_000)

    expect(hashed.hash).not.toContain(password)
    expect(hashed.salt).toBe(salt)
    expect(hashed.iterations).toBe(1_000)
    await expect(verifyPassword({ password, hash: hashed.hash, salt: hashed.salt, iterations: hashed.iterations })).resolves.toBe(true)
    await expect(verifyPassword({ password: "wrong-password", hash: hashed.hash, salt: hashed.salt, iterations: hashed.iterations })).resolves.toBe(false)
  })

  it("uses a default PBKDF2 iteration count supported by Cloudflare Workers", async () => {
    const hashed = await hashPassword("correct-horse-battery-staple")

    expect(hashed.iterations).toBe(PASSWORD_ITERATIONS)
    expect(PASSWORD_ITERATIONS).toBeLessThanOrEqual(100_000)
  })

  it("hashes session tokens deterministically and keeps raw tokens separate", async () => {
    const token = generateSessionToken()
    const tokenHash = await hashToken(token)

    expect(token).not.toBe(tokenHash)
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/)
    await expect(hashToken(token)).resolves.toBe(tokenHash)
  })

  it("compares strings using a timing-safe helper", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true)
    expect(timingSafeEqual("abc123", "abc124")).toBe(false)
    expect(timingSafeEqual("abc123", "abc1234")).toBe(false)
  })
})
