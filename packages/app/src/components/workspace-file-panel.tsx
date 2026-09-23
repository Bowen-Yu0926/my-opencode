import { createMemo, For, Show } from "solid-js"
import { getFilename } from "@opencode-ai/core/util/path"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { ProjectAvatar } from "@opencode-ai/ui/v2/project-avatar-v2"
import { useLanguage } from "@/context/language"
import { useServer } from "@/context/server"
import { useTabs } from "@/context/tabs"
import { useLayout, getProjectAvatarVariant } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useCommand } from "@/context/command"
import { SDKProvider } from "@/context/sdk"
import { FileProvider } from "@/context/file"
import { createHomeController } from "@/pages/home/home-controller"
import { ServerConnection } from "@/context/server"
import { useSettingsCommand } from "@/components/settings-dialog"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import {
  errorMessage,
  displayName,
  toggleHomeProjectSelection,
  getProjectAvatarSource,
} from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import { showToast } from "@/utils/toast"
import FileTree from "@/components/file-tree"

const NAV_ROW =
  "flex h-7 min-w-0 w-full shrink-0 items-center gap-2 rounded-[6px] border-0 bg-transparent px-1.5 text-left\n" +
  "text-v2-text-text-muted [font-weight:440] transition-[background-color,color,box-shadow] duration-[120ms] ease-in-out\n" +
  "hover:bg-v2-background-bg-layer-01 hover:text-v2-text-text-base\n" +
  "focus-visible:bg-v2-background-bg-layer-01 focus-visible:text-v2-text-text-base focus-visible:outline-none\n" +
  "focus-visible:[box-shadow:inset_0_0_0_0.5px_var(--v2-border-border-muted)]\n" +
  "disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-v2-text-text-muted"

const SECTION_LABEL = "flex h-7 min-w-0 shrink-0 items-center px-1.5 text-[13px] leading-4 text-v2-text-text-faint [font-weight:530]"

export function WorkspaceFilePanel() {
  const language = useLanguage()
  const server = useServer()
  const tabs = useTabs()
  const layout = useLayout()
  const platform = usePlatform()
  const command = useCommand()
  const openSettings = useSettingsCommand()
  const serverSDK = useServerSDK()
  const serverSync = useServerSync()
  const home = createHomeController()

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
    if (selected && isKnownDirectory(selected)) return selected
    return projects()[0]?.worktree
  })

  const currentProject = createMemo(() => {
    const directory = activeDirectory()
    if (!directory) return
    const key = pathKey(directory)
    return projects().find((project) => workspacesOf(project).some((item) => pathKey(item) === key))
  })

  command.register("workspace", () => [
    {
      id: "workspace.new",
      title: language.t("workspace.new"),
      category: language.t("command.category.workspace"),
      keybind: "mod+shift+w",
      disabled: !currentProject() || currentProject()?.vcs !== "git",
      onSelect: () => {
        const project = currentProject()
        const conn = server.current
        if (!project || project.vcs !== "git" || !conn) return
        void serverSDK()
          .client.worktree.create({ directory: project.worktree })
          .then((result) => {
            const created = result.data
            if (!created?.directory) return
            serverSync().child(created.directory)
            layout.home.setSelection(
              toggleHomeProjectSelection(selection(), ServerConnection.key(conn), created.directory),
            )
          })
          .catch((err) => {
            showToast({
              title: language.t("workspace.create.failed.title"),
              description: errorMessage(err, language.t("common.requestFailed")),
            })
          })
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
    const conn = server.current
    if (!conn) return
    const key = ServerConnection.key(conn)
    const project = projects()[0]
    if (!project) return
    void tabs.newDraft({ server: key, directory: project.worktree }, "")
  }

  const workspaceNewDisabled = () =>
    !command.options.some((option) => option.id === "workspace.new" && !(option.disabled ?? false))

  return (
    <aside
      aria-label={language.t("sidebar.nav.projectsAndSessions")}
      class="w-[280px] shrink-0 flex flex-col min-h-0 overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)] m-2 mt-0 gap-0.5 p-1.5"
    >
      <div class="flex h-7 shrink-0 items-center justify-between gap-2 pl-1.5 pr-1">
        <span class="min-w-0 truncate text-[13px] leading-4 text-v2-text-text-muted [font-weight:530]">
          {language.t("home.projects")}
        </span>
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
      <div class="flex shrink-0 flex-col gap-0.5">
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
                <button
                  type="button"
                  data-action="workspace-file-panel-project"
                  data-worktree={project.worktree}
                  class={NAV_ROW}
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
                <For each={project.sandboxes ?? []}>
                  {(sandbox) => (
                    <button
                      type="button"
                      data-action="workspace-file-panel-workspace"
                      data-worktree={sandbox}
                      class={`${NAV_ROW} pl-4`}
                      classList={{
                        "bg-v2-background-bg-layer-03 text-v2-text-text-base [font-weight:530]":
                          pathKey(activeDirectory() ?? "") === pathKey(sandbox),
                        "hover:bg-v2-background-bg-layer-03":
                          pathKey(activeDirectory() ?? "") === pathKey(sandbox),
                      }}
                      aria-current={pathKey(activeDirectory() ?? "") === pathKey(sandbox) ? "page" : undefined}
                      onClick={() => selectProject(sandbox)}
                    >
                      <IconV2
                        name="branch"
                        size="small"
                        class="shrink-0 text-v2-icon-icon-muted"
                      />
                      <span class="min-w-0 truncate text-[13px] leading-4 tracking-[-0.04px]">
                        {getFilename(sandbox)}
                      </span>
                    </button>
                  )}
                </For>
              </>
            )}
          </For>
        </Show>
        <button
          type="button"
          data-action="workspace-panel-new-workspace"
          class={NAV_ROW}
          disabled={workspaceNewDisabled()}
          onClick={() => command.trigger("workspace.new")}
        >
          <IconV2 name="plus-small" size="small" class="shrink-0 text-v2-icon-icon-muted" />
          <span class="min-w-0 truncate text-[13px] leading-4 tracking-[-0.04px]">{language.t("workspace.new")}</span>
        </button>
      </div>
      <div class={`${SECTION_LABEL} mt-1`}>{language.t("session.files.all")}</div>
      <Show when={activeDirectory()}>
        {(directory) => (
          <SDKProvider directory={directory()}>
            <FileProvider>
              <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain -mx-0.5 px-0.5 pb-1">
                <FileTree path="" class="pt-0.5" />
              </div>
            </FileProvider>
          </SDKProvider>
        )}
      </Show>
      <div class="mt-1 flex shrink-0 flex-col gap-0.5 border-t border-v2-border-border-muted pt-1">
        <button type="button" data-action="workspace-panel-settings" class={NAV_ROW} onClick={openSettings}>
          <IconV2 name="settings-gear" size="small" class="shrink-0 text-v2-icon-icon-muted" />
          <span class="min-w-0 truncate text-[13px] leading-4 tracking-[-0.04px]">{language.t("sidebar.settings")}</span>
        </button>
        <button
          type="button"
          data-action="workspace-panel-help"
          class={NAV_ROW}
          onClick={() => platform.openExternal("https://opencode.ai/desktop-feedback")}
        >
          <IconV2 name="help" size="small" class="shrink-0 text-v2-icon-icon-muted" />
          <span class="min-w-0 truncate text-[13px] leading-4 tracking-[-0.04px]">{language.t("sidebar.help")}</span>
        </button>
      </div>
    </aside>
  )
}
