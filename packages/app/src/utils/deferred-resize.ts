/** Coalesce ResizeObserver measure→write cycles onto rAF and ignore tiny deltas. */
export function createDeferredMeasure(opts?: { threshold?: number }) {
  const threshold = opts?.threshold ?? 1
  let frame: number | undefined
  let last = Number.NaN
  let pending = 0
  let apply: ((value: number) => void) | undefined

  const flush = () => {
    frame = undefined
    if (!apply) return
    if (Number.isFinite(last) && Math.abs(pending - last) < threshold) return
    last = pending
    apply(pending)
  }

  return {
    schedule(value: number, next: (value: number) => void) {
      pending = value
      apply = next
      if (frame !== undefined) return
      frame = requestAnimationFrame(flush)
    },
    dispose() {
      apply = undefined
      if (frame === undefined) return
      cancelAnimationFrame(frame)
      frame = undefined
    },
  }
}
