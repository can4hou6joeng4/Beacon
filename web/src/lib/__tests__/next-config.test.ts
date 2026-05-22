import { describe, expect, it } from "vitest"
import nextConfig from "../../../next.config"

describe("next config", () => {
  it("allows large PDF uploads through the request proxy", () => {
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBeGreaterThanOrEqual(100 * 1024 * 1024)
  })
})
