import { createEffect, Suspense, type ParentProps } from "solid-js"
import { Titlebar, type TitlebarUpdate } from "@/components/titlebar"
import { TitlebarSessionTabs } from "@/components/titlebar-session-tabs"
import { WorkspaceFilePanel } from "@/components/workspace-file-panel"
import { WorkspaceFileTreePanel } from "@/components/workspace-file-tree-panel"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { setV2Toast, showToast, ToastRegion } from "@/utils/toast"

export default function NewLayout(props: ParentProps) {
  const platform = usePlatform()
  const language = useLanguage()

  createEffect(() => setV2Toast(true))

  const reportUpdateError = (error: unknown) => {
    showToast({
      title: language.t("settings.updates.toast.installFailed.title"),
      description:
        error instanceof Error ? error.message : language.t("settings.updates.toast.installFailed.description"),
    })
  }

  const update: TitlebarUpdate = {
    version: () => {
      const state = platform.updater?.state()
      if (
        state?.status !== "update-available" &&
        state?.status !== "downloading" &&
        state?.status !== "ready" &&
        state?.status !== "installing"
      )
        return
      return state.version
    },
    status: () => platform.updater?.state()?.status,
    percent: () => {
      const state = platform.updater?.state()
      return state?.status === "downloading" ? state.percent : undefined
    },
    download: () => void platform.updater?.download().catch(reportUpdateError),
    dismiss: () => void platform.updater?.dismiss().catch(reportUpdateError),
    install: () => void platform.updater?.install().catch(reportUpdateError),
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
      <main class="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-row contain-strict">
        <WorkspaceFilePanel />
        <div class="workspace-panel-card my-2 mr-0.5 flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
          <TitlebarSessionTabs />
          <div class="min-h-0 min-w-0 flex-1 overflow-x-hidden flex flex-col">
            <Suspense>{props.children}</Suspense>
          </div>
        </div>
        <WorkspaceFileTreePanel />
      </main>
      <ToastRegion v2 />
    </div>
  )
}
