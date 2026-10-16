import { createEffect, Suspense, type ParentProps } from "solid-js"
import { Titlebar, type TitlebarUpdate } from "@/components/titlebar"
import { WorkspaceFilePanel } from "@/components/workspace-file-panel"
import { WorkspaceFileTreePanel } from "@/components/workspace-file-tree-panel"
import { usePlatform } from "@/context/platform"
import { setV2Toast, ToastRegion } from "@/utils/toast"

export default function NewLayout(props: ParentProps) {
  const platform = usePlatform()

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
      <main class="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-row contain-strict">
        <WorkspaceFilePanel />
        <div class="flex-1 min-h-0 min-w-0 overflow-x-hidden flex flex-col my-1.5">
          <Suspense>{props.children}</Suspense>
        </div>
        <WorkspaceFileTreePanel />
      </main>
      <ToastRegion v2 />
    </div>
  )
}
