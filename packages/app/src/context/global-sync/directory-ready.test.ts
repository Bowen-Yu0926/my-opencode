import { describe, expect, test } from "bun:test"
import { joinDirectoryBootstrap } from "./directory-ready"

describe("joinDirectoryBootstrap", () => {
  test("awaits an in-flight bootstrap without starting another", async () => {
    let starts = 0
    let resolve!: () => void
    const pending = new Promise<void>((next) => {
      resolve = next
    })
    const wait = joinDirectoryBootstrap({
      status: "loading",
      pending,
      start: async () => {
        starts++
      },
    })
    resolve()
    await wait
    expect(starts).toBe(0)
  })

  test("starts bootstrap only while status is loading", async () => {
    let starts = 0
    await joinDirectoryBootstrap({
      status: "loading",
      start: async () => {
        starts++
      },
    })
    expect(starts).toBe(1)

    await joinDirectoryBootstrap({
      status: "partial",
      start: async () => {
        starts++
      },
    })
    await joinDirectoryBootstrap({
      status: "complete",
      start: async () => {
        starts++
      },
    })
    expect(starts).toBe(1)
  })
})
