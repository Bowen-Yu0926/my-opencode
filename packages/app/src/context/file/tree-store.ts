import { createStore, produce, reconcile } from "solid-js/store"
import type { FileNode } from "@opencode-ai/sdk/v2"
import { isTransientServerError } from "@/utils/server-errors"

type DirectoryState = {
  expanded: boolean
  loaded?: boolean
  loading?: boolean
  error?: string
  children?: string[]
}

type TreeStoreOptions = {
  scope: () => string
  normalizeDir: (input: string) => string
  list: (input: string) => Promise<FileNode[]>
  onError: (message: string) => void
}

type TreeStore = ReturnType<typeof createFileTreeStore>

const sharedTrees = new Map<string, TreeStore>()
const sharedTreeRefs = new Map<string, number>()
const TRANSIENT_RETRY_LIMIT = 3

export function acquireSharedFileTree(key: string, factory: () => TreeStore): TreeStore {
  const hit = sharedTrees.get(key)
  if (hit) {
    sharedTreeRefs.set(key, (sharedTreeRefs.get(key) ?? 0) + 1)
    return hit
  }

  const store = factory()
  sharedTrees.set(key, store)
  sharedTreeRefs.set(key, 1)
  return store
}

export function peekSharedFileTree(key: string): TreeStore | undefined {
  return sharedTrees.get(key)
}

export function releaseSharedFileTree(key: string) {
  const refs = sharedTreeRefs.get(key)
  if (refs === undefined) return
  if (refs > 1) {
    sharedTreeRefs.set(key, refs - 1)
    return
  }
  sharedTreeRefs.delete(key)
  sharedTrees.delete(key)
}

export function createFileTreeStore(options: TreeStoreOptions) {
  const [tree, setTree] = createStore<{
    node: Record<string, FileNode>
    dir: Record<string, DirectoryState>
  }>({
    node: {},
    dir: { "": { expanded: true } },
  })

  const inflight = new Map<string, Promise<void>>()
  const generation = new Map<string, number>()
  const transientAttempts = new Map<string, number>()

  const reset = () => {
    inflight.clear()
    generation.clear()
    transientAttempts.clear()
    setTree("node", reconcile({}))
    setTree("dir", reconcile({}))
    setTree("dir", "", { expanded: true })
  }

  const ensureDir = (path: string) => {
    if (tree.dir[path]) return
    setTree("dir", path, { expanded: false })
  }

  const listDir = (input: string, opts?: { force?: boolean }) => {
    const dir = options.normalizeDir(input)
    ensureDir(dir)

    const current = tree.dir[dir]
    if (!opts?.force && current?.loaded) return Promise.resolve()

    const pending = inflight.get(dir)
    if (pending && !opts?.force) return pending

    const token = (generation.get(dir) ?? 0) + 1
    generation.set(dir, token)

    setTree(
      "dir",
      dir,
      produce((draft) => {
        draft.loading = true
        draft.error = undefined
        if (opts?.force) draft.loaded = false
      }),
    )

    const directory = options.scope()
    const isCurrent = () => generation.get(dir) === token && options.scope() === directory

    const promise = options
      .list(dir)
      .then((nodes) => {
        if (!isCurrent()) return
        transientAttempts.delete(dir)
        const prevChildren = tree.dir[dir]?.children ?? []
        const nextChildren = nodes.map((node) => node.path)
        const nextSet = new Set(nextChildren)

        setTree(
          "node",
          produce((draft) => {
            const removedDirs: string[] = []

            for (const child of prevChildren) {
              if (nextSet.has(child)) continue
              const existing = draft[child]
              if (existing?.type === "directory") removedDirs.push(child)
              delete draft[child]
            }

            if (removedDirs.length > 0) {
              const keys = Object.keys(draft)
              for (const key of keys) {
                for (const removed of removedDirs) {
                  if (!key.startsWith(removed + "/") && !key.startsWith(removed + "\\")) continue
                  delete draft[key]
                  break
                }
              }
            }

            for (const node of nodes) {
              draft[node.path] = node
            }
          }),
        )

        setTree(
          "dir",
          dir,
          produce((draft) => {
            draft.loaded = true
            draft.loading = false
            draft.error = undefined
            draft.children = nextChildren
          }),
        )
      })
      .catch((e) => {
        if (!isCurrent()) return

        if (isTransientServerError(e)) {
          const attempt = (transientAttempts.get(dir) ?? 0) + 1
          transientAttempts.set(dir, attempt)
          if (attempt <= TRANSIENT_RETRY_LIMIT) {
            // Keep loading=true while retrying so the UI does not go blank.
            queueMicrotask(() => {
              if (generation.get(dir) !== token) return
              if (options.scope() !== directory) return
              void listDir(dir, { force: true })
            })
            return
          }
          transientAttempts.delete(dir)
        }

        setTree(
          "dir",
          dir,
          produce((draft) => {
            draft.loading = false
            // Keep prior children visible on hard failure after retries.
            draft.error = e instanceof Error ? e.message : String(e)
          }),
        )
        if (!isTransientServerError(e)) {
          options.onError(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (inflight.get(dir) === promise) inflight.delete(dir)
      })

    inflight.set(dir, promise)
    return promise
  }

  const refreshAll = () => {
    const dirs = new Set(Object.keys(tree.dir).filter((path) => tree.dir[path]?.loaded))
    dirs.add("")
    return Promise.all([...dirs].map((path) => listDir(path, { force: true })))
  }

  const expandDir = (input: string, behavior?: { list?: boolean }) => {
    const dir = options.normalizeDir(input)
    ensureDir(dir)
    setTree("dir", dir, "expanded", true)
    if (behavior?.list === false) return
    void listDir(dir)
  }

  const collapseDir = (input: string) => {
    const dir = options.normalizeDir(input)
    ensureDir(dir)
    setTree("dir", dir, "expanded", false)
  }

  const dirState = (input: string) => {
    const dir = options.normalizeDir(input)
    return tree.dir[dir]
  }

  const children = (input: string) => {
    const dir = options.normalizeDir(input)
    const ids = tree.dir[dir]?.children
    if (!ids) return []
    const out: FileNode[] = []
    for (const id of ids) {
      const node = tree.node[id]
      if (node) out.push(node)
    }
    return out
  }

  return {
    listDir,
    refreshAll,
    expandDir,
    collapseDir,
    dirState,
    children,
    node: (path: string) => tree.node[path],
    isLoaded: (path: string) => Boolean(tree.dir[path]?.loaded),
    reset,
  }
}
