export type DirectoryBootstrapStatus = "loading" | "partial" | "complete"

/**
 * Join an in-flight directory bootstrap, or start one only while status is still
 * `loading`. Warm directories (partial/complete with no pending work) return immediately.
 */
export async function joinDirectoryBootstrap(input: {
  status: DirectoryBootstrapStatus
  pending?: Promise<void>
  start: () => Promise<void>
}) {
  // partial/complete means the directory Instance is warm enough for file.list —
  // do not wait for slow session/provider bootstrap that may hang indefinitely.
  if (input.status !== "loading") return
  if (input.pending) {
    await input.pending
    return
  }
  await input.start()
}
