import { describe, expect, it } from "vitest"
import { createServerTimingTracker, responseWithServerTiming } from "../server-timing"

describe("server timing", () => {
  it("records measured async work as a Server-Timing header", async () => {
    const tracker = createServerTimingTracker()

    await expect(tracker.measure("r2.put", async () => "ok", "stream upload")).resolves.toBe("ok")
    const response = responseWithServerTiming(Response.json({ ok: true }), tracker)

    expect(response.headers.get("Server-Timing")).toMatch(/r2_put;desc="stream upload";dur=\d+\.\d/)
  })
})
