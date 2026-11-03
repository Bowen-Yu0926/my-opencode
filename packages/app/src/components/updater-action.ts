import { createMemo } from "solid-js"
import type { UpdaterState } from "@/updater"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { showToast } from "@/utils/toast"

export function updaterAction(state: UpdaterState | undefined) {
  if (!state) return { label: "settings.updates.action.checkNow" as const, run: "unavailable" as const }
  switch (state.status) {
    case "checking":
      return { label: "settings.updates.action.checking" as const }
    case "update-available":
      return { label: "titlebar.update" as const, run: "download" as const }
    case "downloading":
      return { label: "settings.updates.action.downloading" as const }
    case "ready":
      return { label: "toast.update.action.installRestart" as const, run: "install" as const }
    case "installing":
      return { label: "settings.updates.action.installing" as const, run: "busy" as const }
    case "dismissed":
      return { label: "titlebar.update" as const, run: "download" as const }
    case "disabled":
      // Still clickable: explain that auto-update is off (dev / unpackaged builds).
      return { label: "settings.updates.action.checkNow" as const, run: "unavailable" as const }
    default:
      return { label: "settings.updates.action.checkNow" as const, run: "check" as const }
  }
}

export function useUpdaterAction() {
  const platform = usePlatform()
  const language = useLanguage()
  const action = createMemo(() => updaterAction(platform.updater?.state()))

  return {
    action,
    async run() {
      const run = action().run
      if (run === "busy") return
      try {
        if (run === "install") {
          await platform.updater?.install()
          return
        }
        if (run === "download") {
          await platform.updater?.download()
          return
        }
      } catch (error) {
        showToast({
          title: language.t("settings.updates.toast.installFailed.title"),
          description: error instanceof Error ? error.message : language.t("settings.updates.toast.installFailed.description"),
        })
        return
      }
      if (run === "unavailable") {
        showToast({
          title: language.t("settings.updates.toast.unavailable.title"),
          description: language.t("settings.updates.toast.unavailable.description"),
        })
        return
      }
      if (run !== "check") return

      const state = await platform.updater?.check()
      if (state?.status === "up-to-date") {
        showToast({
          variant: "success",
          icon: "circle-check",
          title: language.t("settings.updates.toast.latest.title"),
          description: language.t("settings.updates.toast.latest.description", { version: platform.version ?? "" }),
        })
      }
      if (state?.status === "disabled") {
        showToast({
          title: language.t("settings.updates.toast.unavailable.title"),
          description: language.t("settings.updates.toast.unavailable.description"),
        })
      }
      if (state?.status === "error") {
        showToast({ title: language.t("common.requestFailed"), description: state.message })
      }
    },
  }
}
