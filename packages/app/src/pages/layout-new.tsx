import { createEffect, Show, Suspense, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { Portal } from "solid-js/web"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { Titlebar, useTitlebarRightMount, type TitlebarUpdate } from "@/components/titlebar"
import { WorkspaceFilePanel } from "@/components/workspace-file-panel"
import { SessionHistoryList } from "@/components/session-history-panel"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { setV2Toast, ToastRegion } from "@/utils/toast"

export default function NewLayout(props: ParentProps) {
  const platform = usePlatform()
  const language = useLanguage()
  const rightMount = useTitlebarRightMount()
  const [state, setState] = createStore({ historyOpen: false })

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

  return (
    <div
      class="relative bg-v2-background-bg-deep flex-1 min-h-0 min-w-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text"
      style={{
        "padding-top": "env(safe-area-inset-top, 0px)",
        "padding-bottom": "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <Titlebar update={update} />
      <Show when={rightMount()}>
        {(mount) => (
          <Portal mount={mount()}>
            <div class="flex items-center gap-1 shrink-0" data-slot="layout-new-actions">
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
            class="w-[280px] shrink-0 flex flex-col min-h-0 overflow-hidden rounded-[6px] border border-v2-border-border-muted bg-v2-background-bg-base m-2 mt-0 gap-0.5 p-1.5"
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
      <ToastRegion v2 />
    </div>
  )
}
