import { createEffect, createMemo, createSignal, on, Show } from "solid-js"
import { useParams } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { getDirectory, getFilename } from "@opencode-ai/core/util/path"
import type { FileNode } from "@opencode-ai/sdk/v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { DialogFooter, DialogHeader, DialogTitleGroup, DialogV2 } from "@opencode-ai/ui/v2/dialog-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { ScrollView } from "@opencode-ai/ui/scroll-view"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import FileTree from "@/components/file-tree"
import { FileProvider, useFile } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"
import { SDKProvider, useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { createHomeController } from "@/pages/home/home-controller"
import { fileManagerApp } from "@/utils/file-manager"
import { pathKey } from "@/utils/path-key"
import { SessionRouteKey, SessionStateKey } from "@/utils/server-scope"
import { showToast } from "@/utils/toast"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"

function FileTreeSection(props: { refreshTick: number }) {
  const file = useFile()
  const language = useLanguage()
  const layout = useLayout()
  const platform = usePlatform()
  const dialog = useDialog()
  const server = useServer()
  const params = useParams()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const localDesktop = createMemo(
    () => platform.platform === "desktop" && !!platform.revealPath && server.isLocal(),
  )
  const revealLabel = createMemo(() =>
    language.t(fileManagerApp(platform.platform === "desktop" ? (platform.os ?? "unknown") : "unknown").actionLabel),
  )

  createEffect(
    on(
      () => props.refreshTick,
      (tick) => {
        if (tick > 0) void file.tree.refresh("")
      },
      { defer: true },
    ),
  )

  const sessionKey = createMemo(() => {
    const id = params.id
    if (!id) return
    const session = serverSync().session.get(id)
    if (!session) return
    if (pathKey(session.directory) !== pathKey(sdk().directory)) return
    return SessionStateKey.from(
      serverSDK().scope,
      SessionRouteKey.fromRoute(base64Encode(session.directory), id),
    )
  })

  const normalizeTab = (tab: string) => {
    if (!tab.startsWith("file://")) return tab
    return file.tab(tab)
  }

  const reveal = (key: string, path: string, permanent: boolean) => {
    const sessionTabs = layout.tabs(key)
    const next = normalizeTab(file.tab(path))
    if (permanent) void sessionTabs.open(next)
    else sessionTabs.previewTab(next)
    const view = layout.view(key)
    if (!view.reviewPanel.opened()) view.reviewPanel.open()
    if (layout.fileTree.tab() !== "all") layout.fileTree.setTab("all")
    if (permanent) sessionTabs.setActive(next)
    else queueMicrotask(() => sessionTabs.setActive(next))
  }

  const openFile = (node: FileNode) => {
    const key = sessionKey()
    if (!key) return
    reveal(key, node.path, true)
  }

  const previewFile = (node: FileNode) => {
    const key = sessionKey()
    if (!key) return
    reveal(key, node.path, false)
  }

  const absolutePath = (node: FileNode) => node.absolute || node.path

  const parentDir = (node: FileNode) => {
    const dir = getDirectory(node.path).replace(/[/\\]+$/, "")
    return dir === "." || dir === "/" ? "" : dir
  }

  const closeOpenTabs = (node: FileNode) => {
    const key = sessionKey()
    if (!key) return
    const tab = file.tab(node.path)
    layout.tabs(key).close(tab)
  }

  const revealInFolder = (node: FileNode) => {
    if (!platform.revealPath) return
    void platform.revealPath(absolutePath(node)).then((ok) => {
      if (ok) return
      showToast({ title: language.t("session.files.reveal.failed.title") })
    })
  }

  const deleteFile = async (node: FileNode) => {
    if (!platform.trashPath) return
    try {
      const ok = await platform.trashPath(absolutePath(node))
      if (!ok) {
        showToast({ title: language.t("session.files.delete.failed.title") })
        return
      }
      closeOpenTabs(node)
      void file.tree.refresh(parentDir(node))
    } catch (err) {
      showToast({
        title: language.t("session.files.delete.failed.title"),
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const confirmDelete = (node: FileNode) => {
    const name = getFilename(node.path) || node.name
    void dialog.show(() => (
      <DialogV2 fit>
        <DialogHeader hideClose>
          <DialogTitleGroup
            title={language.t("session.files.delete.title")}
            description={language.t("session.files.delete.confirm", { name })}
          />
        </DialogHeader>
        <DialogFooter>
          <ButtonV2 variant="ghost" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </ButtonV2>
          <ButtonV2
            variant="danger"
            onClick={() => {
              void deleteFile(node).finally(() => dialog.close())
            }}
          >
            {language.t("session.files.delete.button")}
          </ButtonV2>
        </DialogFooter>
      </DialogV2>
    ))
  }

  const activePath = createMemo(() => {
    const key = sessionKey()
    if (!key) return
    const active = layout.tabs(key).active()
    if (!active) return
    return file.pathFromTab(active)
  })

  const rootState = createMemo(() => file.tree.state(""))
  const rootChildren = createMemo(() => file.tree.children(""))
  const loading = createMemo(() => Boolean(rootState()?.loading))
  const empty = createMemo(
    () => Boolean(rootState()?.loaded) && !loading() && rootChildren().length === 0,
  )
  const failed = createMemo(() => (!loading() ? rootState()?.error : undefined))

  return (
    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
      <Show when={loading() && !rootChildren().length}>
        <div class="shrink-0 px-1.5 py-2 text-[13px] leading-4 text-v2-text-text-muted [font-weight:440]">
          {language.t("common.loading")}
          {language.t("common.loading.ellipsis")}
        </div>
      </Show>
      <Show when={failed()}>
        {(message) => (
          <div class="shrink-0 px-1.5 py-2 text-[13px] leading-4 text-v2-text-text-muted [font-weight:440]">
            {message()}
          </div>
        )}
      </Show>
      <Show when={empty()}>
        <div class="shrink-0 px-1.5 py-2 text-[13px] leading-4 text-v2-text-text-muted [font-weight:440]">
          {language.t("session.files.empty")}
        </div>
      </Show>
      <ScrollView class="min-h-0 flex-1" data-slot="workspace-file-tree-scroll">
        <FileTree
          path=""
          class="pt-1"
          active={activePath()}
          onFileClick={previewFile}
          onFileDoubleClick={openFile}
          fileMenu={
            localDesktop()
              ? {
                  revealLabel: revealLabel(),
                  deleteLabel: language.t("common.delete"),
                  onReveal: revealInFolder,
                  onDelete: confirmDelete,
                }
              : undefined
          }
        />
      </ScrollView>
    </div>
  )
}

export function WorkspaceFileTreePanel() {
  const language = useLanguage()
  const layout = useLayout()
  const home = createHomeController()
  const server = useServer()
  const serverSync = useServerSync()
  const [refreshTick, setRefreshTick] = createSignal(0)
  const [refreshing, setRefreshing] = createSignal(false)

  const projects = home.project.list
  const selection = layout.home.selection
  const pane = layout.workspacePanels.files
  const panelMax = () => (typeof window === "undefined" ? 480 : Math.min(520, Math.round(window.innerWidth * 0.42)))

  const workspacesOf = (project: { worktree: string; sandboxes?: string[] }) => [
    project.worktree,
    ...(project.sandboxes ?? []),
  ]

  const isKnownDirectory = (directory: string) => {
    const key = pathKey(directory)
    return projects().some((project) => workspacesOf(project).some((item) => pathKey(item) === key))
  }

  // Same source of truth as the left project panel — never override with the
  // open session directory, or clicking another project leaves the wrong tree.
  const activeDirectory = createMemo(() => {
    const selected = selection().directory
    if (selected && (projects().length === 0 || isKnownDirectory(selected))) return selected
    return projects()[0]?.worktree
  })

  const activeDirectoryKey = createMemo(() => {
    const directory = activeDirectory()
    return directory ? pathKey(directory) : undefined
  })

  createEffect(() => {
    const directory = activeDirectory()
    if (!directory) return
    const conn = server.current
    if (conn) {
      const ctx = home.server.context(conn)
      ctx.projects.open(directory)
      ctx.projects.touch(directory)
    }
    serverSync().child(directory)
  })

  async function refreshAll() {
    if (refreshing()) return
    setRefreshing(true)
    try {
      setRefreshTick((tick) => tick + 1)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div
      class="workspace-panel-shell relative my-2 ml-1.5 flex min-h-0 shrink-0 self-stretch"
      style={{ width: pane.opened() ? `${pane.width()}px` : "2.75rem" }}
    >
      <Show
        when={pane.opened()}
        fallback={
          <div class="workspace-panel-card flex h-full w-full flex-col items-center gap-1 pt-2 pb-2">
            <TooltipV2 placement="left" value={language.t("command.fileTree.toggle")}>
              <IconButtonV2
                data-action="workspace-file-tree-expand"
                variant="neutral"
                size="normal"
                icon={<IconV2 name="panel-right" />}
                aria-label={language.t("command.fileTree.toggle")}
                onClick={() => pane.open()}
              />
            </TooltipV2>
          </div>
        }
      >
    <aside
      aria-label={language.t("session.files.all")}
      class="workspace-panel-card flex h-full min-h-0 w-full flex-col gap-0.5 self-stretch"
      data-component="workspace-file-tree-panel"
    >
      <div
        class="flex h-10 shrink-0 items-center gap-2 px-2.5"
        data-tauri-drag-region
        data-slot="workspace-panel-header"
      >
        <span class="min-w-0 truncate text-[13px] leading-4 text-v2-text-text-muted [font-weight:530]">
          {language.t("session.files.all")}
        </span>
        <div data-slot="workspace-panel-toolbar" class="ml-auto flex shrink-0 items-center gap-0.5 rounded-[8px] p-0.5">
          <TooltipV2 placement="bottom" value={language.t("sidebar.refresh")}>
            <IconButtonV2
              data-action="workspace-file-tree-refresh"
              variant="ghost-muted"
              size="small"
              icon={<IconV2 name="refresh" />}
              aria-label={language.t("sidebar.refresh")}
              disabled={refreshing() || !activeDirectory()}
              onClick={refreshAll}
            />
          </TooltipV2>
          <TooltipV2 placement="bottom" value={language.t("command.fileTree.toggle")}>
            <IconButtonV2
              data-action="workspace-file-tree-collapse"
              variant="ghost-muted"
              size="small"
              icon={<IconV2 name="panel-right" />}
              aria-label={language.t("command.fileTree.toggle")}
              onClick={() => pane.close()}
            />
          </TooltipV2>
        </div>
      </div>
      <Show
        when={activeDirectoryKey()}
        keyed
        fallback={
          <div class="px-2.5 py-2 text-[13px] leading-4 text-v2-text-text-muted [font-weight:440]">
            {language.t("sidebar.empty.title")}
          </div>
        }
      >
        {(key) => {
          const directory = activeDirectory()
          if (!directory) return null
          return (
            <div class="flex min-h-0 flex-1 flex-col overflow-hidden px-1.5 pb-1.5" data-directory={key}>
              <SDKProvider directory={directory}>
                <FileProvider passive>
                  <FileTreeSection refreshTick={refreshTick()} />
                </FileProvider>
              </SDKProvider>
            </div>
          )
        }}
      </Show>
    </aside>
        <ResizeHandle
          direction="horizontal"
          edge="start"
          size={pane.width()}
          min={200}
          max={panelMax()}
          collapseThreshold={140}
          onResize={(width) => pane.resize(width)}
          onCollapse={() => pane.close()}
        />
      </Show>
    </div>
  )
}
