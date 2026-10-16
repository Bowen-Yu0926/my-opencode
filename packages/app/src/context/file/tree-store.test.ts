import { describe, expect, test } from "bun:test"
import type { FileNode } from "@opencode-ai/sdk/v2"
import { createFileTreeStore } from "./tree-store"

const node = (path: string): FileNode =>
  ({
    name: path.split("/").pop() ?? path,
    path,
    absolute: path,
    type: "file",
    ignored: false,
  }) as FileNode

/** Mirrors FileProvider's load kickoff with an untracked stale-empty check. */
async function loadRoot(
  store: ReturnType<typeof createFileTreeStore>,
  readStale: () => boolean,
) {
  const staleEmpty = readStale()
  await store.listDir("", staleEmpty ? { force: true } : undefined)
}

describe("createFileTreeStore", () => {
  test("settles after an empty list without staying loading", async () => {
    let calls = 0
    const store = createFileTreeStore({
      scope: () => "/tmp/project",
      normalizeDir: (input) => input.replace(/\/+$/, ""),
      list: async () => {
        calls++
        return []
      },
      onError: () => undefined,
    })

    await store.listDir("")
    expect(calls).toBe(1)
    expect(store.dirState("")?.loading).toBe(false)
    expect(store.dirState("")?.loaded).toBe(true)
    expect(store.children("")).toEqual([])
  })

  test("force reload of empty root completes once", async () => {
    let calls = 0
    const store = createFileTreeStore({
      scope: () => "/tmp/project",
      normalizeDir: (input) => input.replace(/\/+$/, ""),
      list: async () => {
        calls++
        return []
      },
      onError: () => undefined,
    })

    await store.listDir("")
    await store.listDir("", { force: true })
    expect(calls).toBe(2)
    expect(store.dirState("")?.loading).toBe(false)
    expect(store.isLoaded("")).toBe(true)
  })

  test("populated root settles with children", async () => {
    const store = createFileTreeStore({
      scope: () => "/tmp/project",
      normalizeDir: (input) => input.replace(/\/+$/, ""),
      list: async () => [node("a.ts"), node("b.ts")],
      onError: () => undefined,
    })

    await store.listDir("")
    expect(store.dirState("")?.loading).toBe(false)
    expect(store.children("").map((item) => item.path)).toEqual(["a.ts", "b.ts"])
  })

  test("untracked stale-empty load does not loop when empty", async () => {
    let calls = 0
    const store = createFileTreeStore({
      scope: () => "/tmp/project",
      normalizeDir: (input) => input.replace(/\/+$/, ""),
      list: async () => {
        calls++
        return []
      },
      onError: () => undefined,
    })

    // First mount: not loaded → list once.
    await loadRoot(store, () => store.isLoaded("") && store.children("").length === 0)
    expect(calls).toBe(1)

    // Remount with untracked snapshot taken once (as FileProvider now does).
    // A tracked effect would see empty+loaded and force forever.
    const staleEmpty = store.isLoaded("") && store.children("").length === 0
    expect(staleEmpty).toBe(true)
    await loadRoot(store, () => staleEmpty)
    expect(calls).toBe(2)
    expect(store.dirState("")?.loading).toBe(false)

    // Subsequent kickoffs without force must no-op once loaded.
    await store.listDir("")
    expect(calls).toBe(2)
  })

  test("superseded force requests do not leave loading stuck", async () => {
    let resolveFirst!: (nodes: FileNode[]) => void
    let resolveSecond!: (nodes: FileNode[]) => void
    let calls = 0
    const store = createFileTreeStore({
      scope: () => "/tmp/project",
      normalizeDir: (input) => input.replace(/\/+$/, ""),
      list: () => {
        calls++
        if (calls === 1) return new Promise((resolve) => (resolveFirst = resolve))
        return new Promise((resolve) => (resolveSecond = resolve))
      },
      onError: () => undefined,
    })

    const first = store.listDir("")
    expect(store.dirState("")?.loading).toBe(true)
    const second = store.listDir("", { force: true })
    resolveFirst([node("stale.ts")])
    await first
    // Superseded result ignored; still waiting on latest.
    expect(store.dirState("")?.loading).toBe(true)
    expect(store.children("")).toEqual([])

    resolveSecond([node("fresh.ts")])
    await second
    expect(store.dirState("")?.loading).toBe(false)
    expect(store.children("").map((item) => item.path)).toEqual(["fresh.ts"])
  })
})
