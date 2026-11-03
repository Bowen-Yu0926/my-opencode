import { createEffect, createMemo, createSignal, For, Match, on, Show, Switch } from "solid-js"
import type { Session } from "@opencode-ai/sdk/v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { createHomeSessionSource, ProjectSessionList } from "@/components/session-history-panel"
import { useLanguage } from "@/context/language"
import { useServer, ServerConnection } from "@/context/server"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useCommand } from "@/context/command"
import { createHomeController } from "@/pages/home/home-controller"
import { createHomeProjectsController } from "@/pages/home/home-projects-controller"
import { useSettingsCommand } from "@/components/settings-dialog"
import { useUpdaterAction } from "@/components/updater-action"
import { useServerSync } from "@/context/server-sync"
import { displayName, projectForSession } from "@/pages/layout/helpers"
import { fileManagerApp } from "@/utils/file-manager"
import { pathKey } from "@/utils/path-key"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"

const NAV_ROW =
  "flex min-h-8 min-w-0 w-full shrink-0 items-center gap-2 rounded-[8px] border-0 bg-transparent px-2 py-1.5 text-left\n" +
  "text-v2-text-text-muted [font-weight:440] transition-[background-color,color] duration-[140ms] ease-out\n" +
  "hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base\n" +
  "focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-base focus-visible:outline-none\n" +
  "disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-v2-text-text-muted"

export function WorkspaceFilePanel() {
  const language = useLanguage()
  const server = useServer()
  const layout = useLayout()
  const platform = usePlatform()
  const command = useCommand()
  const openSettings = useSettingsCommand()
  const updater = useUpdaterAction()
  const serverSync = useServerSync()
  const home = createHomeController()
  const homeProjects = createHomeProjectsController(home)
  const sessions = createHomeSessionSource()
  const [projectMenu, setProjectMenu] = createSignal<string>()
  const [expanded, setExpanded] = createSignal<string[]>([])

  const updateState = createMemo(() => platform.updater?.state())
  const updateStatus = createMemo(() => updateState()?.status)
  const updateVisible = createMemo(() => {
    const status = updateStatus()
    return (
      status === "update-available" ||
      status === "downloading" ||
      status === "ready" ||
      status === "installing"
    )
  })
  const updatePercent = createMemo(() => {
    const state = updateState()
    if (state?.status !== "downloading") return 0
    return Math.min(100, Math.max(0, state.percent ?? 0))
  })
  const updateLabel = createMemo(() => {
    const state = updateState()
    if (state?.status === "downloading") {
      return language.t("titlebar.update.downloading", { percent: Math.round(state.percent ?? 0) })
    }
    if (state?.status === "ready") return language.t("toast.update.action.installRestart")
    if (state?.status === "installing") return language.t("settings.updates.action.installing")
    if (state?.status === "update-available") {
      return language.t("titlebar.updateVersion", { version: state.version })
    }
    return language.t(updater.action().label)
  })
  const updateTitle = createMemo(() => {
    const state = updateState()
    if (state && "version" in state && state.version) {
      return language.t("titlebar.updateVersion", { version: state.version })
    }
    return updateLabel()
  })
  const updateRingDash = createMemo(() => {
    const circumference = 2 * Math.PI * 5.5
    return `${(updatePercent() / 100) * circumference} ${circumference}`
  })

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

  const expandProject = (worktree: string) => {
    const key = pathKey(worktree)
    setExpanded((current) => (current.some((item) => pathKey(item) === key) ? current : [...current, worktree]))
  }

  const toggleProject = (worktree: string) => {
    const key = pathKey(worktree)
    setExpanded((current) => {
      if (current.some((item) => pathKey(item) === key)) {
        return current.filter((item) => pathKey(item) !== key)
      }
      return [...current, worktree]
    })
  }

  // Keep the workspace project highlight aligned with the active session tab.
  createEffect(
    on(
      () => {
        const route = layout.route()
        if (route.type !== "session") return
        const session = serverSync().session.get(route.sessionId)
        if (!session) return
        return {
          sessionId: route.sessionId,
          projectID: session.projectID,
          directory: session.directory,
        }
      },
      (info) => {
        if (!info) return
        const conn = server.current
        if (!conn) return
        const project = projectForSession(
          {
            id: info.sessionId,
            projectID: info.projectID,
            directory: info.directory,
          } as Session,
          projects(),
        )
        if (!project) return
        const serverKey = ServerConnection.key(conn)
        const current = selection()
        expandProject(project.worktree)
        if (
          current.server === serverKey &&
          current.directory &&
          pathKey(current.directory) === pathKey(project.worktree)
        ) {
          return
        }
        serverSync().child(project.worktree)
        layout.home.setSelection({ server: serverKey, directory: project.worktree })
      },
    ),
  )

  createEffect(() => {
    const directory = activeDirectory()
    if (!directory) return
    if (expanded().length === 0) expandProject(directory)
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
    layout.home.setSelection({ server: ServerConnection.key(conn), directory: worktree })
    expandProject(worktree)
  }

  function addProject() {
    const conn = focusedConn()
    if (!conn) return
    homeProjects.project.choose(conn)
  }

  function newSession() {
    const conn = focusedConn()
    const directory = activeDirectory()
    if (!conn || !directory) return
    homeProjects.project.openNewSession(conn, directory)
  }

  const projectMenuID = (worktree: string) => `workspace-panel:${worktree}`
  const focusedConn = () => home.server.focused() ?? server.current
  const isExpanded = (worktree: string) => expanded().some((item) => pathKey(item) === pathKey(worktree))
  const isActive = (worktree: string) => pathKey(activeDirectory() ?? "") === pathKey(worktree)
  const pane = layout.workspacePanels.projects
  const panelMax = () => (typeof window === "undefined" ? 480 : Math.min(520, Math.round(window.innerWidth * 0.42)))

  return (
    <div
      class="workspace-panel-shell relative my-2 mr-1.5 flex min-h-0 shrink-0 self-stretch"
      style={{ width: pane.opened() ? `${pane.width()}px` : "2.75rem" }}
    >
      <Show
        when={pane.opened()}
        fallback={
          <div class="workspace-panel-card flex h-full w-full flex-col items-center gap-1 pt-2 pb-2">
            <TooltipV2 placement="right" value={language.t("command.sidebar.toggle")}>
              <IconButtonV2
                data-action="workspace-panel-expand"
                variant="neutral"
                size="normal"
                icon={<IconV2 name="panel-left" />}
                aria-label={language.t("command.sidebar.toggle")}
                onClick={() => pane.open()}
              />
            </TooltipV2>
          </div>
        }
      >
        <aside
          aria-label={language.t("sidebar.nav.projectsAndSessions")}
          class="workspace-panel-card flex h-full min-h-0 w-full flex-col gap-0.5"
        >
          <div
            class="flex h-10 shrink-0 items-center justify-between gap-2 px-2.5"
            data-tauri-drag-region
            data-slot="workspace-panel-header"
          >
            <TooltipV2 placement="bottom" value={language.t("command.sidebar.toggle")}>
              <IconButtonV2
                data-action="workspace-panel-collapse"
                variant="ghost-muted"
                size="small"
                icon={<IconV2 name="panel-left" />}
                aria-label={language.t("command.sidebar.toggle")}
                onClick={() => pane.close()}
              />
            </TooltipV2>
          </div>

          <div class="flex shrink-0 flex-col gap-0.5 px-2 pb-1">
            <button
              type="button"
              data-action="workspace-panel-new-session"
              class={NAV_ROW}
              onClick={newSession}
              disabled={!activeDirectory()}
            >
              <IconV2 name="workspace-new" size="small" class="shrink-0 text-v2-icon-icon-muted" />
              <span class="min-w-0 truncate text-[13px] leading-5 tracking-[-0.01em]">
                {language.t("sidebar.action.newSession")}
              </span>
            </button>
            <button type="button" data-action="workspace-panel-search" class={NAV_ROW} onClick={() => command.show()}>
              <IconV2 name="magnifying-glass" size="small" class="shrink-0 text-v2-icon-icon-muted" />
              <span class="min-w-0 truncate text-[13px] leading-5 tracking-[-0.01em]">
                {language.t("sidebar.action.search")}
              </span>
            </button>
          </div>

          <div class="flex h-8 shrink-0 items-center justify-between gap-2 px-3">
            <span class="min-w-0 truncate text-[12px] leading-4 text-v2-text-text-faint [font-weight:530]">
              {language.t("sidebar.workspaces")}
            </span>
            <TooltipV2 placement="bottom" value={language.t("session.new.project.new")}>
              <IconButtonV2
                data-action="workspace-panel-new-project"
                variant="ghost-muted"
                size="small"
                icon={<IconV2 name="folder-add-left" />}
                aria-label={language.t("session.new.project.new")}
                onClick={addProject}
              />
            </TooltipV2>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-1.5">
            <div class="flex flex-col gap-1">
              <Show
                when={projects().length > 0}
                fallback={
                  <div class="px-1.5 py-2 text-[13px] leading-5 text-v2-text-text-muted [font-weight:440]">
                    {language.t("sidebar.empty.title")}
                  </div>
                }
              >
                <For each={projects()}>
                  {(project) => (
                    <div class="flex min-w-0 flex-col gap-0.5">
                      <div
                        class="group/project relative flex min-h-7 min-w-0 items-center rounded-[6px]"
                        onContextMenu={(event) => {
                          event.preventDefault()
                          setProjectMenu(projectMenuID(project.worktree))
                        }}
                      >
                        <button
                          type="button"
                          data-action="workspace-file-panel-project"
                          data-worktree={project.worktree}
                          title={project.worktree}
                          class={`${NAV_ROW} min-h-7 py-1 pr-10`}
                          classList={{
                            "bg-v2-overlay-simple-overlay-hover text-v2-text-text-base [font-weight:530]": isActive(
                              project.worktree,
                            ),
                          }}
                          aria-current={isActive(project.worktree) ? "page" : undefined}
                          aria-expanded={isExpanded(project.worktree)}
                          onClick={() => {
                            selectProject(project.worktree)
                            if (!isExpanded(project.worktree)) expandProject(project.worktree)
                          }}
                        >
                          <IconV2 name="folder" size="small" class="shrink-0 text-v2-icon-icon-muted" />
                          <span class="min-w-0 flex-1 truncate text-[13px] leading-5 tracking-[-0.01em] [font-weight:530]">
                            {displayName(project)}
                          </span>
                        </button>
                        <div
                          data-slot="workspace-project-actions"
                          data-menu={projectMenu() === projectMenuID(project.worktree)}
                          class="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-px rounded-[7px] bg-v2-background-bg-base/90 p-0.5 opacity-0 shadow-[var(--v2-elevation-raised)] backdrop-blur-[6px] transition-opacity duration-120 group-hover/project:opacity-100 focus-within:opacity-100 data-[menu=true]:opacity-100"
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
                              icon={<IconV2 name="more" />}
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
                                <MenuV2.Item onSelect={() => toggleProject(project.worktree)}>
                                  {isExpanded(project.worktree)
                                    ? language.t("sidebar.project.collapse")
                                    : language.t("sidebar.project.expand")}
                                </MenuV2.Item>
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
                            icon={<IconV2 name="plus" />}
                            aria-label={language.t("command.session.new")}
                            onClick={() => {
                              const conn = focusedConn()
                              if (conn) homeProjects.project.openNewSession(conn, project.worktree)
                            }}
                          />
                        </div>
                      </div>
                      <Show when={isExpanded(project.worktree)}>
                        <ProjectSessionList
                          source={sessions}
                          worktree={project.worktree}
                          sandboxes={project.sandboxes}
                        />
                      </Show>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </div>

          <div class="mt-1 flex shrink-0 flex-col gap-0.5 border-t border-v2-border-border-muted px-2 pt-1 pb-1.5">
            <Show when={updateVisible()}>
              <button
                type="button"
                data-action="workspace-panel-update"
                class={`${NAV_ROW} text-v2-text-text-accent hover:text-v2-text-text-accent`}
                title={updateTitle()}
                aria-label={updateLabel()}
                disabled={updateStatus() === "downloading" || updateStatus() === "installing"}
                onClick={() => void updater.run()}
              >
                <span
                  class="flex size-4 shrink-0 items-center justify-center text-v2-icon-icon-accent"
                  aria-hidden="true"
                >
                  <Switch>
                    <Match when={updateStatus() === "downloading"}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle
                          cx="7"
                          cy="7"
                          r="5.5"
                          stroke-width="1.5"
                          style={{ stroke: "color-mix(in srgb, var(--v2-icon-icon-accent) 30%, transparent)" }}
                        />
                        <circle
                          cx="7"
                          cy="7"
                          r="5.5"
                          stroke-width="1.5"
                          stroke="currentColor"
                          stroke-linecap="round"
                          stroke-dasharray={updateRingDash()}
                          transform="rotate(-90 7 7)"
                        />
                      </svg>
                    </Match>
                    <Match when={true}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M7 11V3M3.5 7.63128L7 11L10.5 7.63128" stroke="currentColor" />
                      </svg>
                    </Match>
                  </Switch>
                </span>
                <span class="min-w-0 truncate text-[13px] leading-5 tracking-[-0.01em]">{updateLabel()}</span>
              </button>
            </Show>
            <button type="button" data-action="workspace-panel-settings" class={NAV_ROW} onClick={openSettings}>
              <IconV2 name="settings-gear" size="small" class="shrink-0 text-v2-icon-icon-muted" />
              <span class="min-w-0 truncate text-[13px] leading-5 tracking-[-0.01em]">
                {language.t("sidebar.settings")}
              </span>
            </button>
          </div>
        </aside>
        <ResizeHandle
          direction="horizontal"
          edge="end"
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
