import { createEffect, Show, Suspense, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { Portal } from "solid-js/web"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { DebugBar } from "@/components/debug-bar"
import { TabsInfoPopup } from "@/components/help-button"
import { Titlebar, useTitlebarRightMount, type TitlebarUpdate } from "@/components/titlebar"
import { WorkspaceFilePanel } from "@/components/workspace-file-panel"
import { SessionHistoryList } from "@/components/session-history-panel"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { useServer, ServerConnection } from "@/context/server"
import { useGlobal } from "@/context/global"
import { useTabs } from "@/context/tabs"
import { setV2Toast, ToastRegion } from "@/utils/toast"

export default function NewLayout(props: ParentProps) {
  const platform = usePlatform()
  const language = useLanguage()
  const server = useServer()
  const global = useGlobal()
  const tabs = useTabs()
  const rightMount = useTitlebarRightMount()
  const [state, setState] = createStore({ debugTools: true, historyOpen: false })

  createEffect(() => setV2Toast(true))

  const update: TitlebarUpdate = {
    version: () => {
      const state = platform.updater?.state()
      if (state?.status !== "ready") return
      return state.version
    },
    installing: () => platform.updater?.state().status === "installing",
    install: () => void platform.updater?.install(),
  }

  const createSession = () => {
    const conn = server.current
    if (!conn) return
    const key = ServerConnection.key(conn)
    const project = global.ensureServerCtx(conn).projects.list()[0]
    if (project) {
      void tabs.newDraft({ server: key, directory: project.worktree }, "")
      return
    }
    const fallback = global.servers.list().flatMap((item) => {
      const next = global.ensureServerCtx(item).projects.list()[0]
      return next ? [{ server: ServerConnection.key(item), project: next }] : []
    })[0]
    if (!fallback) return
    void tabs.newDraft({ server: fallback.server, directory: fallback.project.worktree }, "")
  }

  return (
    <div
      class="relative bg-v2-background-bg-deep flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
      style={{
        "padding-top": "env(safe-area-inset-top, 0px)",
        "padding-bottom": "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <Titlebar
        update={update}
        debugTools={
          import.meta.env.DEV
            ? { visible: state.debugTools, toggle: () => setState("debugTools", (value) => !value) }
            : undefined
        }
      />
      <Show when={rightMount()}>
        {(mount) => (
          <Portal mount={mount()}>
            <div class="flex items-center gap-1 shrink-0" data-slot="layout-new-actions">
              <TooltipV2 placement="bottom" value={language.t("command.session.new")}>
                <IconButtonV2
                  type="button"
                  variant="ghost-muted"
                  size="normal"
                  icon={<IconV2 name="plus" />}
                  aria-label={language.t("command.session.new")}
                  data-action="layout-new-session"
                  onClick={createSession}
                />
              </TooltipV2>
              <TooltipV2 placement="bottom" value={language.t("sidebar.project.recentSessions")}>
                <IconButtonV2
                  type="button"
                  variant="ghost-muted"
                  size="normal"
                  icon={<IconV2 name="history" />}
                  aria-label={language.t("sidebar.project.recentSessions")}
                  aria-pressed={state.historyOpen}
                  state={state.historyOpen ? "pressed" : undefined}
                  data-action="layout-toggle-history"
                  onClick={() => setState("historyOpen", (value) => !value)}
                />
              </TooltipV2>
            </div>
          </Portal>
        )}
      </Show>
      <main class="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-row contain-strict">
        <WorkspaceFilePanel />
        <div class="flex-1 min-h-0 min-w-0 overflow-x-hidden flex flex-col">
          <Suspense>{props.children}</Suspense>
        </div>
        <Show when={state.historyOpen}>
          <aside
            aria-label={language.t("sidebar.project.recentSessions")}
            class="w-[280px] shrink-0 flex flex-col min-h-0 overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)] m-2 mt-0 gap-0.5 p-1.5"
          >
            <div class="flex h-7 shrink-0 items-center justify-between gap-2 pl-1.5 pr-1">
              <span class="min-w-0 truncate text-[13px] leading-4 text-v2-text-text-muted [font-weight:530]">
                {language.t("sidebar.project.recentSessions")}
              </span>
              <TooltipV2 placement="bottom" value={language.t("common.close")}>
                <IconButtonV2
                  type="button"
                  variant="ghost-muted"
                  size="small"
                  icon={<IconV2 name="close" />}
                  aria-label={language.t("common.close")}
                  data-action="layout-close-history"
                  onClick={() => setState("historyOpen", false)}
                />
              </TooltipV2>
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain -mx-0.5 px-0.5 pb-1">
              <SessionHistoryList />
            </div>
          </aside>
        </Show>
      </main>
      {import.meta.env.DEV && state.debugTools && <DebugBar inline />}
      <TabsInfoPopup />
      <ToastRegion v2 />
    </div>
  )
}
