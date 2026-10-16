import { batch, createEffect, createMemo, on, onCleanup, untrack } from "solid-js"
import { createStore, produce, reconcile } from "solid-js/store"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { showToast } from "@/utils/toast"
import { useParams } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { getFilename } from "@opencode-ai/core/util/path"
import { useSDK } from "./sdk"
import { useSync } from "./sync"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { createPathHelpers } from "./file/path"
import {
  approxBytes,
  evictContentLru,
  getFileContentBytesTotal,
  getFileContentEntryCount,
  hasFileContent,
  removeFileContentBytes,
  resetFileContentLru,
  setFileContentBytes,
  touchFileContent,
} from "./file/content-cache"
import { createFileViewCache } from "./file/view-cache"
import { useServerSDK } from "./server-sdk"
import { SessionRouteKey, SessionStateKey } from "@/utils/server-scope"
import { pathKey } from "@/utils/path-key"
import { isTransientServerError } from "@/utils/server-errors"
import { createFileTreeStore, acquireSharedFileTree, peekSharedFileTree, releaseSharedFileTree } from "./file/tree-store"
import { invalidateFromWatcher } from "./file/watcher"
import {
  selectionFromLines,
  type FileState,
  type FileSelection,
  type FileViewState,
  type SelectedLineRange,
} from "./file/types"

export type { FileSelection, SelectedLineRange, FileViewState, FileState }
export { selectionFromLines }
export {
  evictContentLru,
  getFileContentBytesTotal,
  getFileContentEntryCount,
  removeFileContentBytes,
  resetFileContentLru,
  setFileContentBytes,
  touchFileContent,
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error) return error
  return fallback
}

export const { use: useFile, provider: FileProvider } = createSimpleContext({
  name: "File",
  gate: false,
  init: (props: { passive?: boolean }) => {
    const sdk = useSDK()
    if (!props.passive) useSync()
    const params = useParams()
    const serverSDK = useServerSDK()
    const language = useLanguage()
    const layout = useLayout()

    const scope = createMemo(() => sdk().directory)
    const path = createPathHelpers(scope)
    const tabs = layout.tabs(() =>
      SessionStateKey.from(serverSDK().scope, SessionRouteKey.fromRoute(base64Encode(sdk().directory), params.id)),
    )

    const inflight = new Map<string, Promise<void>>()
    const [store, setStore] = createStore<{
      file: Record<string, FileState>
    }>({
      file: {},
    })

    let acquiredTreeKey: string | undefined
    const tree = createMemo(() => {
      const directory = scope()
      const shareKey = `${serverSDK().scope}\u0000${pathKey(directory)}`
      if (acquiredTreeKey === shareKey) {
        const existing = peekSharedFileTree(shareKey)
        if (existing) return existing
      }
      const helpers = createPathHelpers(() => directory)
      const store = acquireSharedFileTree(shareKey, () =>
        createFileTreeStore({
          // Freeze the worktree string into the shared tree. Refcount can outlive
          // the creating FileProvider; a live scope memo would go stale.
          scope: () => directory,
          normalizeDir: helpers.normalizeDir,
          // Must use createClient({ directory }) so the worktree is sent on the
          // request. On v2, serverSDK().api.file.list ignores location.directory
          // and hits the server default cwd — only the first project looks fine.
          list: (dir) =>
            serverSDK()
              .createClient({ directory, throwOnError: true })
              .file.list({ path: dir || "." })
              .then((x) => {
                if (x.error) throw x.error
                const data = x.data
                return Array.isArray(data) ? data : []
              }),
          onError: (message) => {
            if (isTransientServerError(message)) return
            showToast({
              variant: "error",
              title: language.t("toast.file.listFailed.title"),
              description: message,
            })
          },
        }),
      )
      if (acquiredTreeKey !== undefined && acquiredTreeKey !== shareKey) {
        releaseSharedFileTree(acquiredTreeKey)
      }
      acquiredTreeKey = shareKey
      return store
    })
    onCleanup(() => {
      if (acquiredTreeKey === undefined) return
      releaseSharedFileTree(acquiredTreeKey)
      acquiredTreeKey = undefined
    })

    const evictContent = (keep?: Set<string>) => {
      evictContentLru(keep, (target) => {
        if (!store.file[target]) return
        setStore(
          "file",
          target,
          produce((draft) => {
            draft.content = undefined
            draft.loaded = false
          }),
        )
      })
    }

    createEffect(() => {
      scope()
      inflight.clear()
      batch(() => {
        setStore("file", reconcile({}))
      })
      const shared = tree()
      // Must untrack store reads. Tracking isLoaded/children here re-runs this
      // effect when listDir finishes; an empty root then force-reloads forever
      // and the UI sticks on "加载中…".
      const staleEmpty = untrack(() => shared.isLoaded("") && shared.children("").length === 0)
      void shared.listDir("", staleEmpty ? { force: true } : undefined)
    })

    const viewCache = createFileViewCache(serverSDK().scope)
    const view = createMemo(() => viewCache.load(scope(), params.id))

    const ensure = (file: string) => {
      if (!file) return
      if (store.file[file]) return
      setStore("file", file, { path: file, name: getFilename(file) })
    }

    const setLoading = (file: string) => {
      setStore(
        "file",
        file,
        produce((draft) => {
          draft.loading = true
          draft.error = undefined
        }),
      )
    }

    const setLoaded = (file: string, content: FileState["content"]) => {
      setStore(
        "file",
        file,
        produce((draft) => {
          draft.loaded = true
          draft.loading = false
          draft.content = content
        }),
      )
    }

    const setLoadError = (file: string, message: string) => {
      setStore(
        "file",
        file,
        produce((draft) => {
          draft.loading = false
          draft.error = message
        }),
      )
      showToast({
        variant: "error",
        title: language.t("toast.file.loadFailed.title"),
        description: message,
      })
    }

    const load = (input: string, options?: { force?: boolean }) => {
      const file = path.normalize(input)
      if (!file) return Promise.resolve()

      const directory = scope()
      const key = `${directory}\n${file}`
      ensure(file)

      const current = store.file[file]
      if (!options?.force && current?.loaded) return Promise.resolve()

      const pending = inflight.get(key)
      if (pending) return pending

      setLoading(file)

      const promise = sdk()
        .client.file.read({ path: file })
        .then((x) => {
          if (scope() !== directory) return
          const content = x.data
          setLoaded(file, content)

          if (!content) return
          touchFileContent(file, approxBytes(content))
          evictContent(new Set([file]))
        })
        .catch((e) => {
          if (scope() !== directory) return
          setLoadError(file, errorMessage(e, language.t("error.chain.unknown")))
        })
        .finally(() => {
          inflight.delete(key)
        })

      inflight.set(key, promise)
      return promise
    }

    const search = (query: string, dirs: "true" | "false", options?: { limit?: number; signal?: AbortSignal }) =>
      serverSDK()
        .api.file.find(
          {
            location: { directory: sdk().directory },
            query,
            type: dirs === "true" ? "directory" : "file",
            limit: options?.limit,
          },
          { signal: options?.signal },
        )
        .then(
          (x) => x.data.map((entry) => path.normalize(entry.path)),
          (error) => {
            if (options?.signal?.aborted) throw error
            return []
          },
        )

    const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>()
    const scheduleRefresh = (dir: string) => {
      const pending = refreshTimers.get(dir)
      if (pending) clearTimeout(pending)
      refreshTimers.set(
        dir,
        setTimeout(() => {
          refreshTimers.delete(dir)
          void tree().listDir(dir, { force: true })
        }, 200),
      )
    }

    let stopWatcher: (() => void) | undefined
    createEffect(
      on(
        () => [sdk(), tree()] as const,
        ([current, treeStore]) => {
          stopWatcher?.()
          stopWatcher = current.event.listen((e) => {
            invalidateFromWatcher(e.details, {
              normalize: path.normalize,
              hasFile: (file) => Boolean(store.file[file]),
              isOpen: (file) => tabs.all().some((tab) => path.pathFromTab(tab) === file),
              loadFile: (file) => {
                void load(file, { force: true })
              },
              node: treeStore.node,
              isDirLoaded: treeStore.isLoaded,
              refreshDir: scheduleRefresh,
            })
          })
        },
      ),
    )
    onCleanup(() => {
      stopWatcher?.()
      for (const timer of refreshTimers.values()) clearTimeout(timer)
      refreshTimers.clear()
    })

    const get = (input: string) => {
      const file = path.normalize(input)
      const state = store.file[file]
      const content = state?.content
      if (!content) return state
      if (hasFileContent(file)) {
        touchFileContent(file)
        return state
      }
      touchFileContent(file, approxBytes(content))
      return state
    }

    function withPath(input: string, action: (file: string) => unknown) {
      return action(path.normalize(input))
    }
    const scrollTop = (input: string) => withPath(input, (file) => view().scrollTop(file))
    const scrollLeft = (input: string) => withPath(input, (file) => view().scrollLeft(file))
    const selectedLines = (input: string) => withPath(input, (file) => view().selectedLines(file))
    const setScrollTop = (input: string, top: number) => withPath(input, (file) => view().setScrollTop(file, top))
    const setScrollLeft = (input: string, left: number) => withPath(input, (file) => view().setScrollLeft(file, left))
    const setSelectedLines = (input: string, range: SelectedLineRange | null) =>
      withPath(input, (file) => view().setSelectedLines(file, range))

    onCleanup(() => {
      stopWatcher?.()
      viewCache.clear()
    })

    return {
      ready: () => view().ready(),
      normalize: path.normalize,
      tab: path.tab,
      pathFromTab: path.pathFromTab,
      tree: {
        list: (input: string) => tree().listDir(input),
        refresh: (input: string) => tree().listDir(input, { force: true }),
        refreshAll: () => tree().refreshAll(),
        state: (input: string) => tree().dirState(input),
        children: (input: string) => tree().children(input),
        expand: (input: string, behavior?: { list?: boolean }) => tree().expandDir(input, behavior),
        collapse: (input: string) => tree().collapseDir(input),
        toggle(input: string) {
          const treeStore = tree()
          if (treeStore.dirState(input)?.expanded) {
            treeStore.collapseDir(input)
            return
          }
          treeStore.expandDir(input)
        },
      },
      get,
      load,
      scrollTop,
      scrollLeft,
      setScrollTop,
      setScrollLeft,
      selectedLines,
      setSelectedLines,
      searchFiles: (query: string, options?: { limit?: number; signal?: AbortSignal }) =>
        search(query, "false", options),
      searchFilesAndDirectories: (query: string) => search(query, "true"),
    }
  },
})
