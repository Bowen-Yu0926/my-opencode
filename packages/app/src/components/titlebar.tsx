import { createEffect, createMemo, createSignal, Match, Show, Switch, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import { useLocation, useNavigate, useParams } from "@solidjs/router"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { Button } from "@opencode-ai/ui/button"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"

import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { WindowsAppMenu } from "./windows-app-menu"
import { applyPath, backPath, forwardPath } from "./titlebar-history"
import { createMediaQuery } from "@solid-primitives/media"
import "./titlebar.css"

const legacyTitlebarHeight = 40
/** App menu row only; session tabs live in the center column. */
const v2TitlebarHeight = 40
const minTitlebarZoom = 0.25
const windowsControlsBaseWidth = 138 // 3 native Windows caption buttons at 46px each.
const macTrafficLightsBaseWidth = 84

export type TitlebarUpdateStatus =
  | "update-available"
  | "downloading"
  | "ready"
  | "dismissed"
  | "checking"
  | "up-to-date"
  | "installing"
  | "error"
  | "idle"
  | "disabled"
  | undefined

export type TitlebarUpdate = {
  version: () => string | undefined
  status: () => TitlebarUpdateStatus
  percent: () => number | undefined
  download: () => void
  dismiss: () => void
  install: () => void
}

const titlebarRightMount = createSignal<HTMLElement | null>(null)

export function useTitlebarRightMount() {
  return titlebarRightMount[0]
}

export function registerTitlebarRightMount(element: HTMLElement | null) {
  const current = titlebarRightMount[0]()
  if (element === current) return
  if (!element && current?.isConnected) return
  titlebarRightMount[1](element)
}

export function Titlebar(props: { update?: TitlebarUpdate; embedded?: boolean }) {
  const layout = useLayout()
  const platform = usePlatform()
  const command = useCommand()
  const language = useLanguage()
  const settings = useSettings()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const useV2Titlebar = createMemo(() => settings.general.newLayoutDesigns())
  const mobile = createMediaQuery("(max-width: 767px)")
  const bottom = createMemo(() => useV2Titlebar() && mobile() && settings.general.mobileTitlebarPosition() === "bottom")

  const mac = createMemo(() => platform.platform === "desktop" && platform.os === "macos")
  const windows = createMemo(() => platform.platform === "desktop" && platform.os === "windows")
  const linux = createMemo(() => platform.platform === "desktop" && platform.os === "linux")
  const web = createMemo(() => platform.platform === "web")
  const macTrafficLights = createMemo(() => mac() && !platform.windowFullscreen?.())
  const zoom = () => platform.webviewZoom?.() ?? 1
  const titlebarZoom = () => (windows() ? Math.max(zoom(), minTitlebarZoom) : zoom())
  const counterZoom = () => (windows() && titlebarZoom() < 1 ? 1 / titlebarZoom() : 1)
  const minHeight = () => {
    const height = useV2Titlebar() ? v2TitlebarHeight : legacyTitlebarHeight
    if (mac()) return `${height / zoom()}px`
    if (windows()) return `${height / Math.min(titlebarZoom(), 1)}px`
    return undefined
  }
  const windowsControlsWidth = () => `${windowsControlsBaseWidth / Math.max(titlebarZoom(), 1)}px`

  const [history, setHistory] = createStore({
    stack: [] as string[],
    index: 0,
    action: undefined as "back" | "forward" | undefined,
  })

  const path = () => `${location.pathname}${location.search}${location.hash}`
  const creating = createMemo(() => {
    const route = layout.route()
    if (route.type === "draft" || route.type === "dir-new-sesssion") return true
    if (!params.dir) return false
    if (params.id) return false
    const parts = location.pathname.replace(/\/+$/, "").split("/")
    return parts.at(-1) === "session"
  })

  createEffect(() => {
    const current = path()

    untrack(() => {
      const next = applyPath(history, current)
      if (next === history) return
      setHistory(next)
    })
  })

  const canBack = createMemo(() => history.index > 0)
  const canForward = createMemo(() => history.index < history.stack.length - 1)
  const hasProjects = createMemo(() => layout.projects.list().length > 0)
  const nav = createMemo(() => (useV2Titlebar() ? settings.general.showNavigation() : true))
  const updateState = createMemo<TitlebarUpdatePillState>(() => {
    const status = props.update?.status()
    const version = props.update?.version()
    const percent = props.update?.percent()
    return {
      visible: status === "update-available" || status === "downloading" || status === "ready",
      status,
      percent,
      label: language.t("titlebar.update"),
      dismissLabel: language.t("titlebar.update.dismiss"),
      downloadLabel: language.t("titlebar.update.downloading", { percent: Math.round(percent ?? 0) }),
      ariaLabel: language.t("toast.update.action.installRestart"),
      title: version ? language.t("titlebar.updateVersion", { version }) : undefined,
      onDownload: () => props.update?.download(),
      onDismiss: () => props.update?.dismiss(),
      onInstall: () => props.update?.install(),
    }
  })
  const v2RightState = createMemo<TitlebarV2RightState>(() => ({
    update: updateState(),
  }))

  const back = () => {
    const next = backPath(history)
    if (!next) return
    setHistory(next.state)
    navigate(next.to)
  }

  const forward = () => {
    const next = forwardPath(history)
    if (!next) return
    setHistory(next.state)
    navigate(next.to)
  }

  command.register(() => [
    {
      id: "common.goBack",
      title: language.t("common.goBack"),
      category: language.t("command.category.view"),
      keybind: "mod+[",
      onSelect: back,
    },
    {
      id: "common.goForward",
      title: language.t("common.goForward"),
      category: language.t("command.category.view"),
      keybind: "mod+]",
      onSelect: forward,
    },
  ])

  return (
    <header
      data-slot={useV2Titlebar() ? "titlebar-v2" : undefined}
      classList={{
        "shrink-0 relative flex flex-row": true,
        "h-10 bg-v2-background-bg-deep overflow-visible": useV2Titlebar(),
        "h-10 bg-background-base overflow-hidden": !useV2Titlebar(),
        "order-last": bottom(),
      }}
      style={{
        "min-height": minHeight(),
        // Keep native macOS traffic lights clear even when the desktop window is narrow.
        // Full-width titlebar (layout-new) owns the traffic-light / caption edges; embedded keeps center-only chrome.
        "padding-left": !props.embedded && macTrafficLights() ? `${macTrafficLightsBaseWidth / zoom()}px` : 0,
        width:
          windows() && !props.embedded
            ? `env(titlebar-area-width, calc(100vw - ${windowsControlsWidth()}))`
            : undefined,
        "max-width":
          windows() && !props.embedded
            ? `env(titlebar-area-width, calc(100vw - ${windowsControlsWidth()}))`
            : undefined,
        // Native Windows caption controls remain on the physical right in both writing directions.
        "margin-right": windows() && !props.embedded ? "auto" : undefined,
      }}
      data-tauri-drag-region
    >
      <Switch>
        <Match when={useV2Titlebar()}>
          <div
            data-slot="titlebar-v2-menu"
            class="flex h-full min-w-0 flex-1 flex-row items-center gap-1 px-2 md:pr-3"
            classList={{
              "pt-1": !props.embedded && !bottom(),
              "pb-1": !props.embedded && bottom(),
              "md:pl-2": macTrafficLights(),
              "md:pl-2.5": !macTrafficLights(),
            }}
            data-tauri-drag-region
          >
            <ChannelIndicator />
            <Show when={windows() || linux()}>
              <WindowsAppMenu command={command} platform={platform} variant="v2" />
            </Show>
            <div class="min-w-0 flex-1" data-tauri-drag-region />
            <TitlebarV2Right state={v2RightState()} />
          </div>
        </Match>
        <Match when>
          <div
            class="grid h-full min-h-full w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"
            style={{ zoom: counterZoom() }}
          >
            <div
              classList={{
                "flex items-center min-w-0": true,
                "pl-2": !macTrafficLights(),
              }}
            >
              <Show when={windows() || linux()}>
                <WindowsAppMenu command={command} platform={platform} />
              </Show>
              <Show when={mac()}>
                <div class="xl:hidden w-10 shrink-0 flex items-center justify-center">
                  <IconButton
                    icon="menu"
                    variant="ghost"
                    class="titlebar-icon rounded-md"
                    onClick={layout.mobileSidebar.toggle}
                    aria-label={language.t("sidebar.menu.toggle")}
                    aria-expanded={layout.mobileSidebar.opened()}
                  />
                </div>
              </Show>
              <Show when={!mac()}>
                <div class="xl:hidden w-[48px] shrink-0 flex items-center justify-center">
                  <IconButton
                    icon="menu"
                    variant="ghost"
                    class="titlebar-icon rounded-md"
                    onClick={layout.mobileSidebar.toggle}
                    aria-label={language.t("sidebar.menu.toggle")}
                    aria-expanded={layout.mobileSidebar.opened()}
                  />
                </div>
              </Show>
              <div class="flex items-center gap-1 shrink-0">
                <TooltipKeybind
                  class={web() ? "hidden xl:flex shrink-0 ml-14" : "hidden xl:flex shrink-0 ml-2"}
                  placement="bottom"
                  title={language.t("command.sidebar.toggle")}
                  keybind={command.keybind("sidebar.toggle")}
                >
                  <Button
                    variant="ghost"
                    class="group/sidebar-toggle titlebar-icon w-8 h-6 p-0 box-border"
                    onClick={layout.sidebar.toggle}
                    aria-label={language.t("command.sidebar.toggle")}
                    aria-expanded={layout.sidebar.opened()}
                  >
                    <Icon size="small" name={layout.sidebar.opened() ? "sidebar-active" : "sidebar"} />
                  </Button>
                </TooltipKeybind>
                <div class="hidden xl:flex items-center shrink-0">
                  <Show when={params.dir}>
                    <div
                      class="flex items-center shrink-0 w-8 mr-1"
                      aria-hidden={layout.sidebar.opened() ? "true" : undefined}
                    >
                      <div
                        class="transition-opacity"
                        classList={{
                          "opacity-100 duration-120 ease-out": !layout.sidebar.opened(),
                          "opacity-0 duration-120 ease-in delay-0 pointer-events-none": layout.sidebar.opened(),
                        }}
                      >
                        <TooltipKeybind
                          placement="bottom"
                          title={language.t("command.session.new")}
                          keybind={command.keybind("session.new")}
                          openDelay={800}
                        >
                          <Button
                            variant="ghost"
                            class="titlebar-icon w-8 h-6 p-0 box-border"
                            disabled={layout.sidebar.opened()}
                            tabIndex={layout.sidebar.opened() ? -1 : undefined}
                            onClick={() => {
                              if (!params.dir) return
                              navigate(`/${params.dir}/session`)
                            }}
                            aria-label={language.t("command.session.new")}
                            aria-current={creating() ? "page" : undefined}
                          >
                            <IconV2 name="edit" size="small" />
                          </Button>
                        </TooltipKeybind>
                      </div>
                    </div>
                  </Show>
                  <div
                    class="flex items-center shrink-0"
                    classList={{
                      "ltr:-translate-x-[36px] rtl:translate-x-[36px]": layout.sidebar.opened() && !!params.dir,
                      "duration-180 ease-out": !layout.sidebar.opened(),
                      "duration-180 ease-in": layout.sidebar.opened(),
                    }}
                  >
                    <Show when={hasProjects() && nav()}>
                      <div class="flex items-center gap-0 transition-transform">
                        <Tooltip placement="bottom" value={language.t("common.goBack")} openDelay={800}>
                          <Button
                            variant="ghost"
                            icon="chevron-left"
                            class="titlebar-icon w-6 h-6 p-0 box-border"
                            disabled={!canBack()}
                            onClick={back}
                            aria-label={language.t("common.goBack")}
                          />
                        </Tooltip>
                        <Tooltip placement="bottom" value={language.t("common.goForward")} openDelay={800}>
                          <Button
                            variant="ghost"
                            icon="chevron-right"
                            class="titlebar-icon w-6 h-6 p-0 box-border"
                            disabled={!canForward()}
                            onClick={forward}
                            aria-label={language.t("common.goForward")}
                          />
                        </Tooltip>
                      </div>
                    </Show>
                    <div id="opencode-titlebar-left" class="flex items-center gap-3 min-w-0 px-2" />
                  </div>
                </div>
                <ChannelIndicator />
              </div>
            </div>

            <div class="min-w-0 flex items-center justify-center pointer-events-none">
              <div
                id="opencode-titlebar-center"
                class="pointer-events-auto min-w-0 flex justify-center w-fit max-w-full"
              />
            </div>

            <div
              classList={{
                "flex items-center min-w-0 justify-end": true,
                "pr-2": !windows(),
              }}
              data-tauri-drag-region
            >
              <div
                id="opencode-titlebar-right"
                ref={registerTitlebarRightMount}
                class="flex items-center gap-1 shrink-0 justify-end"
              />
              <Show when={windows()}>
                <div class="shrink-0" style={{ width: windowsControlsWidth() }} />
              </Show>
            </div>
          </div>
        </Match>
      </Switch>
    </header>
  )
}

type TitlebarUpdatePillState = {
  visible: boolean
  status: TitlebarUpdateStatus
  percent?: number
  label: string
  dismissLabel: string
  downloadLabel: string
  ariaLabel: string
  title?: string
  onDownload: () => void
  onDismiss: () => void
  onInstall: () => void
}

type TitlebarV2RightState = {
  update: TitlebarUpdatePillState
}

function TitlebarV2Right(props: { state: TitlebarV2RightState }) {
  return (
    <div class="relative z-20 flex shrink-0 items-center justify-end gap-0 overflow-visible">
      <Show when={props.state.update.visible}>
        <TitlebarUpdateIconButton state={props.state.update} />
      </Show>
      <div
        id="opencode-titlebar-right"
        ref={registerTitlebarRightMount}
        class="flex shrink-0 items-center justify-end gap-0"
      />
    </div>
  )
}

function TitlebarUpdateIconButton(props: { state: TitlebarUpdatePillState }) {
  const status = props.state.status
  const percent = Math.min(100, Math.max(0, props.state.percent ?? 0))
  const ringCircumference = 2 * Math.PI * 5.5
  const ringDash = `${(percent / 100) * ringCircumference} ${ringCircumference}`

  return (
    <div
      class="group relative mr-3 h-5 w-5 shrink-0 rounded-full bg-v2-background-bg-deep transition-[width] duration-150 ease-out hover:z-30 focus-within:z-30 motion-reduce:transition-none"
      classList={{
        "hover:w-[96px] focus-within:w-[96px]": status === "update-available",
        "hover:w-[104px] focus-within:w-[104px]": status === "downloading",
        "hover:w-[124px] focus-within:w-[124px]": status === "ready",
      }}
    >
      <Switch>
        <Match when={status === "update-available"}>
          <div class="absolute right-0 top-0 flex h-5 w-5 items-center justify-end overflow-hidden rounded-full bg-v2-icon-icon-accent/20 text-v2-icon-icon-accent transition-[width,background-color] duration-150 ease-out group-hover:w-[96px] group-hover:bg-[color-mix(in_srgb,var(--v2-icon-icon-accent)_20%,var(--v2-background-bg-deep))] group-focus-within:w-[96px] group-focus-within:bg-[color-mix(in_srgb,var(--v2-icon-icon-accent)_20%,var(--v2-background-bg-deep))] motion-reduce:transition-none">
            <span class="flex shrink-0 translate-x-2 items-center gap-1.5 opacity-0 motion-safe:transition-all duration-150 ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100 motion-reduce:translate-x-0">
              <button
                type="button"
                class="text-[11px] text-v2-text-text-accent [font-weight:530] focus-visible:outline-none"
                aria-label={props.state.label}
                onClick={props.state.onDownload}
              >
                {props.state.label}
              </button>
              <button
                type="button"
                class="text-[11px] text-v2-text-text-accent [font-weight:530] focus-visible:outline-none"
                aria-label={props.state.dismissLabel}
                onClick={props.state.onDismiss}
              >
                {props.state.dismissLabel}
              </button>
            </span>
            <span class="ml-1.5 mr-px flex size-5 shrink-0 items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M7 11V3M3.5 7.63128L7 11L10.5 7.63128" stroke="currentColor" />
              </svg>
            </span>
          </div>
        </Match>
        <Match when={status === "downloading"}>
          <div class="absolute right-0 top-0 flex h-5 w-5 items-center justify-end overflow-hidden rounded-full bg-v2-icon-icon-accent/20 text-v2-icon-icon-accent transition-[width,background-color] duration-150 ease-out group-hover:w-[104px] group-hover:bg-[color-mix(in_srgb,var(--v2-icon-icon-accent)_20%,var(--v2-background-bg-deep))] group-focus-within:w-[104px] group-focus-within:bg-[color-mix(in_srgb,var(--v2-icon-icon-accent)_20%,var(--v2-background-bg-deep))] motion-reduce:transition-none">
            <span class="ml-[8px] mr-px shrink-0 text-[11px] text-v2-text-text-accent [font-weight:530] opacity-0 translate-x-2 motion-safe:transition-all duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:translate-x-0 motion-reduce:translate-x-0">
              {props.state.downloadLabel}
            </span>
            <span class="flex size-5 shrink-0 items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
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
                  stroke-dasharray={ringDash}
                  transform="rotate(-90 7 7)"
                />
              </svg>
            </span>
          </div>
        </Match>
        <Match when={status === "ready"}>
          <button
            type="button"
            class="absolute right-0 top-0 z-10 flex h-5 w-5 items-center justify-end overflow-hidden rounded-full bg-v2-icon-icon-accent/20 text-v2-icon-icon-accent transition-[width,background-color] duration-150 ease-out group-hover:w-[124px] group-hover:bg-[color-mix(in_srgb,var(--v2-icon-icon-accent)_20%,var(--v2-background-bg-deep))] group-focus-within:w-[124px] group-focus-within:bg-[color-mix(in_srgb,var(--v2-icon-icon-accent)_20%,var(--v2-background-bg-deep))] focus-visible:outline-none motion-reduce:transition-none"
            onClick={props.state.onInstall}
            aria-label={props.state.ariaLabel}
          >
            <span class="ml-[8px] mr-px shrink-0 text-[11px] text-v2-text-text-accent [font-weight:530] opacity-0 translate-x-2 motion-safe:transition-all duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:translate-x-0 motion-reduce:translate-x-0">
              {props.state.ariaLabel}
            </span>
            <span class="flex size-5 shrink-0 items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M7 11V3M3.5 7.63128L7 11L10.5 7.63128" stroke="currentColor" />
              </svg>
            </span>
          </button>
        </Match>
      </Switch>
    </div>
  )
}

function ChannelIndicator() {
  const channel = import.meta.env.VITE_OPENCODE_CHANNEL
  // Dev builds no longer show a channel badge; beta keeps a static marker.
  if (channel !== "beta") return null
  return (
    <div class="shrink-0 rounded-[4px] bg-v2-background-bg-accent px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase leading-none tracking-wide text-white">
      BETA
    </div>
  )
}
