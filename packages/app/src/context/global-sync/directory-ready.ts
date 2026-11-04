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
  if (input.pending) {
    await input.pending
    return
  }
  if (input.status !== "loading") return
  await input.start()
}
