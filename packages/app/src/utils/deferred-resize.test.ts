import { describe, expect, test } from "bun:test"
import { createDeferredMeasure } from "./deferred-resize"

describe("createDeferredMeasure", () => {
  test("defers apply to the next animation frame and skips sub-threshold deltas", () => {
    const frames: FrameRequestCallback[] = []
    const previous = globalThis.requestAnimationFrame
    const previousCancel = globalThis.cancelAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      frames.push(cb)
      return frames.length
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame

    try {
      const measure = createDeferredMeasure({ threshold: 1 })
      const values: number[] = []

      measure.schedule(10, (value) => values.push(value))
      measure.schedule(10.4, (value) => values.push(value))
      expect(values).toEqual([])
      expect(frames).toHaveLength(1)

      frames[0]?.(0)
      expect(values).toEqual([10.4])

      measure.schedule(10.9, (value) => values.push(value))
      frames[1]?.(0)
      expect(values).toEqual([10.4])

      measure.schedule(12, (value) => values.push(value))
      frames[2]?.(0)
      expect(values).toEqual([10.4, 12])
    } finally {
      globalThis.requestAnimationFrame = previous
      globalThis.cancelAnimationFrame = previousCancel
    }
  })

  test("dispose cancels a pending frame", () => {
    let cancelled = 0
    const frames: FrameRequestCallback[] = []
    const previous = globalThis.requestAnimationFrame
    const previousCancel = globalThis.cancelAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      frames.push(cb)
      return 7
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((id: number) => {
      if (id === 7) cancelled += 1
    }) as typeof cancelAnimationFrame

    try {
      const measure = createDeferredMeasure()
      const values: number[] = []
      measure.schedule(3, (value) => values.push(value))
      measure.dispose()
      frames[0]?.(0)
      expect(cancelled).toBe(1)
      expect(values).toEqual([])
    } finally {
      globalThis.requestAnimationFrame = previous
      globalThis.cancelAnimationFrame = previousCancel
    }
  })
})
