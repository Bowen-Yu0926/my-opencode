import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js"
import { useParams } from "@solidjs/router"
import { getFilename } from "@opencode-ai/core/util/path"
import { base64Encode } from "@opencode-ai/core/util/encode"
import type { FileNode } from "@opencode-ai/sdk/v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { ProjectAvatar } from "@opencode-ai/ui/v2/project-avatar-v2"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { useLayout, getProjectAvatarVariant } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useCommand } from "@/context/command"
import { SDKProvider, useSDK } from "@/context/sdk"
import { FileProvider, useFile } from "@/context/file"
import { createHomeController } from "@/pages/home/home-controller"
import { createHomeProjectsController } from "@/pages/home/home-projects-controller"
import { ServerConnection } from "@/context/server"
import { useSettingsCommand } from "@/components/settings-dialog"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import {
  displayName,
  toggleHomeProjectSelection,
  getProjectAvatarSource,
} from "@/pages/layout/helpers"
import { fileManagerApp } from "@/utils/file-manager"
import { pathKey } from "@/utils/path-key"
import { SessionRouteKey, SessionStateKey } from "@/utils/server-scope"
import FileTree from "@/components/file-tree"

const NAV_ROW =
  "flex h-7 min-w-0 w-full shrink-0 items-center gap-2 rounded-[6px] border-0 bg-transparent px-1.5 text-left\n" +
  "text-v2-text-text-muted [font-weight:440] transition-[background-color,color,box-shadow] duration-[120ms] ease-in-out\n" +
  "hover:bg-v2-background-bg-layer-02 hover:text-v2-text-text-base\n" +
  "focus-visible:bg-v2-background-bg-layer-02 focus-visible:text-v2-text-text-base focus-visible:outline-none\n" +
  "focus-visible:[box-shadow:inset_0_0_0_0.5px_var(--v2-border-border-muted)]\n" +
  "disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-v2-text-text-muted"

const SECTION_LABEL = "flex h-7 min-w-0 shrink-0 items-center px-1.5 text-[13px] leading-4 text-v2-text-text-faint [font-weight:530]"

function FileTreeSection(props: { refreshTick: number }) {
  const file = useFile()
  const layout = useLayout()
  const params = useParams()
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  createEffect(
    on(
      () => props.refreshTick,
      (tick) => {
        if (tick > 0) void file.tree.refreshAll()
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

  const activePath = createMemo(() => {
    const key = sessionKey()
    if (!key) return
    const active = layout.tabs(key).active()
    if (!active) return
    return file.pathFromTab(active)
  })

  return (
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain -mx-0.5 px-0.5 pb-1">
      <FileTree
        path=""
        class="pt-0.5"
        active={activePath()}
        onFileClick={previewFile}
        onFileDoubleClick={openFile}
      />
    </div>
  )
}

export function WorkspaceFilePanel() {
  const language = useLanguage()
  const server = useServer()
  const tabs = useTabs()
  const layout = useLayout()
  const platform = usePlatform()
  const command = useCommand()
  const openSettings = useSettingsCommand()
  const serverSync = useServerSync()
  const home = createHomeController()
  const homeProjects = createHomeProjectsController(home)
  const [refreshTick, setRefreshTick] = createSignal(0)
  const [refreshing, setRefreshing] = createSignal(false)
  const [projectMenu, setProjectMenu] = createSignal<string>()

  const selection = layout.home.selection
  const projects = home.project.list

  const workspacesOf = (project: { worktree: string; sandboxes?: string[] }) => [
    project.worktree,
    ...(project.sandboxes ?? []),
  ]

  const isKnownDirectory = (directory: string) => {
    const key = pathKey(directory)
    return projects().some((project) => workspacesOf(project).some((item) => pathKey(item) === key))
  }

  const activeDirectory = createMemo(() => {
    const selected = selection().directory
    if (selected && (projects().length === 0 || isKnownDirectory(selected))) return selected
    return projects()[0]?.worktree
  })

  const currentProject = createMemo(() => {
    const directory = activeDirectory()
    if (!directory) return
    const key = pathKey(directory)
    return projects().find((project) => workspacesOf(project).some((item) => pathKey(item) === key))
  })

  // Local personal build: workspace / sandbox creation disabled. The desktop File menu still
  // binds "Open project…" to this id, which the new layout has no other registration for.
  command.register("workspace", () => [
    {
      id: "project.open",
      title: language.t("command.project.open"),
      category: language.t("command.category.project"),
      keybind: "mod+o",
      onSelect: () => {
        const conn = home.server.focused() ?? server.current
        if (conn) homeProjects.project.choose(conn)
      },
    },
  ])

  function selectProject(worktree: string) {
    const conn = server.current
    if (!conn) return
    serverSync().child(worktree)
    layout.home.setSelection(toggleHomeProjectSelection(selection(), ServerConnection.key(conn), worktree))
  }

  function createSession() {
    const conn = focusedConn()
    const directory = activeDirectory()
    if (!conn || !directory) return
    void tabs.newDraft({ server: ServerConnection.key(conn), directory }, "")
  }

  async function refreshAll() {
    if (refreshing()) return
    setRefreshing(true)
    try {
      await serverSync().refreshBootstrap()
      setRefreshTick((tick) => tick + 1)
    } finally {
      setRefreshing(false)
    }
  }

  const projectMenuID = (worktree: string) => `workspace-panel:${worktree}`
  const focusedConn = () => home.server.focused() ?? server.current

  return (
    <aside
      aria-label={language.t("sidebar.nav.projectsAndSessions")}
      class="w-[280px] shrink-0 flex flex-col min-h-0 overflow-hidden rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-base m-2 mt-0 gap-1 p-2"
    >
      <div class="flex h-7 shrink-0 items-center justify-between gap-2 pl-1.5 pr-1">
        <span class="min-w-0 truncate text-[13px] leading-4 text-v2-text-text-muted [font-weight:530]">
          {language.t("home.projects")}
        </span>
        <div class="flex shrink-0 items-center gap-1">
          <TooltipV2 placement="bottom" value={language.t("sidebar.refresh")}>
            <IconButtonV2
              data-action="workspace-panel-refresh"
              variant="ghost-muted"
              size="small"
              icon={<IconV2 name="refresh" />}
              aria-label={language.t("sidebar.refresh")}
              disabled={refreshing()}
              onClick={refreshAll}
            />
          </TooltipV2>
          <TooltipV2 placement="bottom" value={language.t("command.session.new")}>
            <IconButtonV2
              data-action="workspace-panel-new-session"
              variant="ghost-muted"
              size="small"
              icon={<IconV2 name="edit" />}
              aria-label={language.t("command.session.new")}
              onClick={createSession}
            />
          </TooltipV2>
        </div>
      </div>
      <div class="flex shrink-0 flex-col gap-1">
        <Show
          when={projects().length > 0}
          fallback={
            <div class="px-1.5 py-2 text-[13px] leading-4 text-v2-text-text-muted [font-weight:440]">
              {language.t("sidebar.empty.title")}
            </div>
          }
        >
          <For each={projects()}>
            {(project) => (
              <>
                <div
                  class="group/project relative flex h-7 min-w-0 items-center rounded-[6px]"
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setProjectMenu(projectMenuID(project.worktree))
                  }}
                >
                  <button
                    type="button"
                    data-action="workspace-file-panel-project"
                    data-worktree={project.worktree}
                    class={`${NAV_ROW} pr-16`}
                    classList={{
                      "bg-v2-background-bg-layer-03 text-v2-text-text-base [font-weight:530]":
                        pathKey(activeDirectory() ?? "") === pathKey(project.worktree),
                      "hover:bg-v2-background-bg-layer-03":
                        pathKey(activeDirectory() ?? "") === pathKey(project.worktree),
                    }}
                    aria-current={
                      pathKey(activeDirectory() ?? "") === pathKey(project.worktree) ? "page" : undefined
                    }
                    onClick={() => selectProject(project.worktree)}
                  >
                    <ProjectAvatar
                      class="size-4 shrink-0"
                      fallback={displayName(project)}
                      src={getProjectAvatarSource(project.id, project.icon)}
                      variant={getProjectAvatarVariant(project.icon?.color)}
                    />
                    <span class="min-w-0 truncate text-[13px] leading-4 tracking-[-0.04px]">
                      {displayName(project)}
                    </span>
                  </button>
                  <div
                    data-menu={projectMenu() === projectMenuID(project.worktree)}
                    class="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 focus-within:opacity-100 data-[menu=true]:opacity-100"
                  >
                    <MenuV2
                      gutter={6}
                      modal={false}
                      placement="bottom-end"
                      open={projectMenu() === projectMenuID(project.worktree)}
                      onOpenChange={(open) =>
                        setProjectMenu(open ? projectMenuID(project.worktree) : undefined)
                      }
                    >
                      <MenuV2.Trigger
                        as={IconButtonV2}
                        data-action="workspace-file-panel-project-menu"
                        variant="ghost-muted"
                        size="small"
                        icon={<IconV2 name="outline-dots" />}
                        aria-label={language.t("common.moreOptions")}
                      />
                      <MenuV2.Portal>
                        <MenuV2.Content>
                          <MenuV2.Item
                            onSelect={() => {
                              const conn = focusedConn()
                              if (conn) homeProjects.project.openNewSession(conn, project.worktree)
                            }}
                          >
                            {language.t("command.session.new")}
                          </MenuV2.Item>
                          <MenuV2.Item
                            onSelect={() => {
                              const conn = focusedConn()
                              if (conn) homeProjects.project.edit(conn, project)
                            }}
                          >
                            {language.t("dialog.project.edit.title")}
                          </MenuV2.Item>
                          <Show when={focusedConn() && homeProjects.project.canReveal(focusedConn()!)}>
                            <MenuV2.Item
                              onSelect={() => {
                                const conn = focusedConn()
                                if (conn) homeProjects.project.reveal(conn, project)
                              }}
                            >
                              {language.t(
                                fileManagerApp(
                                  platform.platform === "desktop" ? (platform.os ?? "unknown") : "unknown",
                                ).actionLabel,
                              )}
                            </MenuV2.Item>
                          </Show>
                          <MenuV2.Item
                            disabled={
                              !focusedConn() || homeProjects.project.unseenCount(focusedConn()!, project) === 0
                            }
                            onSelect={() => {
                              const conn = focusedConn()
                              if (conn) homeProjects.project.clearNotifications(conn, project)
                            }}
                          >
                            {language.t("sidebar.project.clearNotifications")}
                          </MenuV2.Item>
                          <MenuV2.Separator />
                          <MenuV2.Item
                            onSelect={() => {
                              const conn = focusedConn()
                              if (conn) homeProjects.project.close(conn, project.worktree)
                            }}
                          >
                            {language.t("home.project.remove")}
                          </MenuV2.Item>
                        </MenuV2.Content>
                      </MenuV2.Portal>
                    </MenuV2>
                    <IconButtonV2
                      data-action="workspace-file-panel-project-new-session"
                      variant="ghost-muted"
                      size="small"
                      icon={<IconV2 name="edit" />}
                      aria-label={language.t("command.session.new")}
                      onClick={() => {
                        const conn = focusedConn()
                        if (conn) homeProjects.project.openNewSession(conn, project.worktree)
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </For>
        </Show>
        <button
          type="button"
          data-action="workspace-panel-new-project"
          class={NAV_ROW}
          disabled={!focusedConn()}
          onClick={() => {
            const conn = focusedConn()
            if (conn) homeProjects.project.choose(conn)
          }}
        >
          <IconV2 name="plus-small" size="small" class="shrink-0 text-v2-icon-icon-muted" />
          <span class="min-w-0 truncate text-[13px] leading-4 tracking-[-0.04px]">
            {language.t("session.new.project.new")}
          </span>
        </button>
      </div>
      <div class={`${SECTION_LABEL} mt-1`}>{language.t("session.files.all")}</div>
      <Show when={activeDirectory()}>
        {(directory) => (
          <SDKProvider directory={directory()}>
            <FileProvider passive>
              <FileTreeSection refreshTick={refreshTick()} />
            </FileProvider>
          </SDKProvider>
        )}
      </Show>
      <div class="mt-1 flex shrink-0 flex-col gap-0.5 border-t border-v2-border-border-muted pt-1">
        <button type="button" data-action="workspace-panel-settings" class={NAV_ROW} onClick={openSettings}>
          <IconV2 name="settings-gear" size="small" class="shrink-0 text-v2-icon-icon-muted" />
          <span class="min-w-0 truncate text-[13px] leading-4 tracking-[-0.04px]">{language.t("sidebar.settings")}</span>
        </button>
      </div>
    </aside>
  )
}
