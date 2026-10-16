import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js"
import type { Session } from "@opencode-ai/sdk/v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { ProjectAvatar } from "@opencode-ai/ui/v2/project-avatar-v2"
import { createHomeSessionSource, ProjectSessionList } from "@/components/session-history-panel"
import { useLanguage } from "@/context/language"
import { useServer, ServerConnection } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { useLayout, getProjectAvatarVariant } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useCommand } from "@/context/command"
import { createHomeController } from "@/pages/home/home-controller"
import { createHomeProjectsController } from "@/pages/home/home-projects-controller"
import { useSettingsCommand } from "@/components/settings-dialog"
import { useServerSync } from "@/context/server-sync"
import { displayName, projectForSession, getProjectAvatarSource } from "@/pages/layout/helpers"
import { fileManagerApp } from "@/utils/file-manager"
import { pathKey } from "@/utils/path-key"

const NAV_ROW =
  "flex min-h-7 min-w-0 w-full shrink-0 items-center gap-1.5 rounded-[6px] border-0 bg-transparent px-1.5 py-1 text-left\n" +
  "text-v2-text-text-muted [font-weight:440] transition-[background-color,color] duration-[100ms] ease-out\n" +
  "hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base\n" +
  "focus-visible:bg-v2-overlay-simple-overlay-hover focus-visible:text-v2-text-text-base focus-visible:outline-none\n" +
  "disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-v2-text-text-muted"

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
  const sessions = createHomeSessionSource()
  const [projectMenu, setProjectMenu] = createSignal<string>()
  const [expanded, setExpanded] = createSignal<string>()

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
        if (
          current.server === serverKey &&
          current.directory &&
          pathKey(current.directory) === pathKey(project.worktree)
        ) {
          setExpanded(project.worktree)
          return
        }
        serverSync().child(project.worktree)
        layout.home.setSelection({ server: serverKey, directory: project.worktree })
        setExpanded(project.worktree)
      },
    ),
  )

  createEffect(() => {
    const directory = activeDirectory()
    if (!directory) return
    if (!expanded()) setExpanded(directory)
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
    setExpanded(worktree)
  }

  function toggleProject(worktree: string) {
    setExpanded((current) => (current && pathKey(current) === pathKey(worktree) ? undefined : worktree))
  }

  function createSession() {
    const conn = focusedConn()
    const directory = activeDirectory()
    if (!conn || !directory) return
    void tabs.newDraft({ server: ServerConnection.key(conn), directory }, "")
  }

  const projectMenuID = (worktree: string) => `workspace-panel:${worktree}`
  const focusedConn = () => home.server.focused() ?? server.current
  const isExpanded = (worktree: string) => !!expanded() && pathKey(expanded()!) === pathKey(worktree)
  const isActive = (worktree: string) => pathKey(activeDirectory() ?? "") === pathKey(worktree)

  return (
    <aside
      aria-label={language.t("sidebar.nav.projectsAndSessions")}
      class="m-1.5 flex w-[260px] shrink-0 flex-col gap-0.5 overflow-hidden rounded-[12px] border border-v2-border-border-muted bg-v2-background-bg-base min-h-0"
    >
      <div
        class="flex h-10 shrink-0 items-center justify-between gap-2 px-2.5"
        data-tauri-drag-region
        data-slot="workspace-panel-header"
      >
        <span class="min-w-0 truncate text-[13px] leading-4 text-v2-text-text-muted [font-weight:530]">
          {language.t("home.projects")}
        </span>
        <TooltipV2 placement="bottom" value={language.t("command.session.new")}>
          <IconButtonV2
            data-action="workspace-panel-new-session"
            variant="ghost-muted"
            size="small"
            icon={<IconV2 name="plus" />}
            aria-label={language.t("command.session.new")}
            onClick={createSession}
          />
        </TooltipV2>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-1.5">
        <div class="flex flex-col gap-px">
          <Show
            when={projects().length > 0}
            fallback={
              <div class="px-1.5 py-2 text-[14px] leading-5 text-v2-text-text-muted [font-weight:440]">
                {language.t("sidebar.empty.title")}
              </div>
            }
          >
            <For each={projects()}>
              {(project) => (
                <div class="flex min-w-0 flex-col gap-px">
                  <div
                    class="group/project relative flex min-h-8 min-w-0 items-center rounded-[6px]"
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
                      class={`${NAV_ROW} items-center pr-8`}
                      classList={{
                        "bg-v2-overlay-simple-overlay-hover text-v2-text-text-base [font-weight:530]": isActive(
                          project.worktree,
                        ),
                      }}
                      aria-current={isActive(project.worktree) ? "page" : undefined}
                      aria-expanded={isExpanded(project.worktree)}
                      onClick={() => {
                        selectProject(project.worktree)
                        if (!isExpanded(project.worktree)) setExpanded(project.worktree)
                      }}
                    >
                      <span
                        data-action="workspace-file-panel-project-expand"
                        class="flex size-4 shrink-0 items-center justify-center text-v2-icon-icon-muted"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          toggleProject(project.worktree)
                        }}
                      >
                        <IconV2
                          name="chevron-down"
                          size="small"
                          class="size-3.5 transition-transform duration-100"
                          classList={{ "-rotate-90": !isExpanded(project.worktree) }}
                        />
                      </span>
                      <ProjectAvatar
                        class="size-4 shrink-0"
                        fallback={displayName(project)}
                        src={getProjectAvatarSource(project.id, project.icon)}
                        variant={getProjectAvatarVariant(project.icon?.color)}
                      />
                      <span class="flex min-w-0 flex-1 items-baseline gap-1.5">
                        <span class="shrink-0 text-[14px] leading-5 tracking-[-0.01em] [font-weight:530]">
                          {displayName(project)}
                        </span>
                        <span class="min-w-0 flex-1 truncate text-[12px] leading-5 text-v2-text-text-faint [font-weight:400]">
                          {project.worktree}
                        </span>
                      </span>
                    </button>
                    <div
                      data-menu={projectMenu() === projectMenuID(project.worktree)}
                      class="absolute right-0.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover/project:opacity-100 focus-within:opacity-100 data-[menu=true]:opacity-100"
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
      <div class="mt-1 flex shrink-0 flex-col gap-0.5 border-t border-v2-border-border-muted pt-1">
        <button type="button" data-action="workspace-panel-settings" class={NAV_ROW} onClick={openSettings}>
          <IconV2 name="settings-gear" size="small" class="shrink-0 text-v2-icon-icon-muted" />
          <span class="min-w-0 truncate text-[14px] leading-5 tracking-[-0.01em]">{language.t("sidebar.settings")}</span>
        </button>
      </div>
    </aside>
  )
}
