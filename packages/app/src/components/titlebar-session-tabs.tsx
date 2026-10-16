import { createEffect, createResource, createSignal } from "solid-js"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { KeybindV2 } from "@opencode-ai/ui/v2/keybind-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { makeEventListener } from "@solid-primitives/event-listener"
import { LayoutRoute, useLayout } from "@/context/layout"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useGlobal } from "@/context/global"
import { ServerConnection, useServer } from "@/context/server"
import { tabKey, useTabs } from "@/context/tabs"
import type { PromptSession } from "@/context/prompt"
import { TitlebarTabStrip } from "@/components/titlebar-tab-strip"
import { readSessionTabsRemovedDetail, SESSION_TABS_REMOVED_EVENT } from "@/components/titlebar-session-events"
import { newTabTooltipKeybind } from "./command-tooltip-keybind"
import { normalizeSessionInfo } from "@/utils/session"
import { pathKey } from "@/utils/path-key"
import "./titlebar.css"

/** Session tab strip for the center column (below the app menu, between side panels). */
export function TitlebarSessionTabs() {
  const layout = useLayout()
  const command = useCommand()
  const language = useLanguage()
  const global = useGlobal()
  const server = useServer()
  const tabs = useTabs()
  const tabsStore = tabs.store
  const tabsStoreActions = tabs
  const [tabsAreOverflowing, setTabsAreOverflowing] = createSignal(false)

  const [session] = createResource(
    () => {
      const route = layout.route()
      if (route.type !== "session") return undefined
      const conn = global.servers.list().find((item) => ServerConnection.key(item) === (route.server ?? server.key))
      return conn ? { route, sdk: global.ensureServerCtx(conn).sdk } : undefined
    },
    ({ route, sdk }) =>
      sdk.api.session
        .get({ sessionID: route.sessionId })
        .then(normalizeSessionInfo)
        .catch(() => {}),
  )

  const matchRoute = (route: LayoutRoute) => {
    if (route.type === "home") return
    if (route.type === "draft") {
      return tabsStore.find((item) => item.type === "draft" && item.draftID === route.draftID)
    }
    if (route.type === "session") {
      const main = tabsStore.find(
        (item) => item.type === "session" && item.server === route.server && item.sessionId === route.sessionId,
      )
      if (main) return main
      const s = session()
      if (s?.parentID) {
        const parentID = s.parentID
        const parent = tabsStore.find(
          (item) => item.type === "session" && item.server === route.server && item.sessionId === parentID,
        )
        if (parent) return parent
      }
    }
  }

  const currentTab = () => matchRoute(layout.route())

  createEffect(() => {
    const route = layout.route()
    if (!tabs.ready()) return
    const tab = currentTab()
    if (tab) {
      tabs.remember(tab)
      return
    }

    if (route.type === "session") {
      const s = session()
      if (!s) return
      const sessionId = s.parentID ?? s.id
      const next = { server: route.server ?? server.key, sessionId }
      tabsStoreActions.addSessionTab(next)
    }
  })

  makeEventListener(window, SESSION_TABS_REMOVED_EVENT, (event) => {
    const detail = readSessionTabsRemovedDetail(event)
    if (!detail) return
    tabsStoreActions.removeSessions(detail)
  })

  const openNewTab = () => {
    const selection = layout.home.selection()
    const selectionDirectory = selection.directory
    const selectionKey = selectionDirectory ? pathKey(selectionDirectory) : undefined
    const selectionConn = global.servers.list().find((item) => ServerConnection.key(item) === selection.server)
    const selectionProject =
      selectionConn && selectionKey
        ? global
            .ensureServerCtx(selectionConn)
            .projects.list()
            .find(
              (item) =>
                pathKey(item.worktree) === selectionKey ||
                item.sandboxes?.some((sandbox) => pathKey(sandbox) === selectionKey),
            )
        : undefined
    if (selectionDirectory && selectionConn && selectionProject) {
      void tabs.newDraft({ server: ServerConnection.key(selectionConn), directory: selectionDirectory }, "")
      return
    }

    const route = layout.route()
    const activeSession = session()
    if (route.type === "session" && activeSession) {
      const sessionTab = {
        type: "session" as const,
        server: route.server ?? server.key,
        sessionId: activeSession.id,
      }
      const model = tabs.stateValue<PromptSession>(sessionTab, "prompt")?.model.current()
      void tabs.newDraft({ server: sessionTab.server, directory: activeSession.directory }, "", model)
      return
    }

    const activeTab = currentTab()
    if (activeTab?.type === "draft") {
      const model = tabs.stateValue<PromptSession>(activeTab, "prompt")?.model.current()
      void tabs.newDraft({ server: activeTab.server, directory: activeTab.directory }, "", model)
      return
    }

    const current = layout.projects.list()[0]
    if (current) {
      void tabs.newDraft({ server: server.key, directory: current.worktree }, "")
      return
    }

    const fallback = global.servers.list().flatMap((conn) => {
      const project = global.ensureServerCtx(conn).projects.list()[0]
      return project ? [{ server: ServerConnection.key(conn), project }] : []
    })[0]
    if (!fallback) return

    void tabs.newDraft({ server: fallback.server, directory: fallback.project.worktree }, "")
  }

  const toggleHome = () => tabs.toggleHome({ home: layout.route().type === "home", current: currentTab() })

  command.register("titlebar-home", () => [
    {
      id: "home.toggle",
      title: language.t("home.title"),
      category: language.t("command.category.view"),
      keybind: "mod+b",
      hidden: true,
      onSelect: toggleHome,
    },
  ])

  command.register("tabs", () => {
    const current = currentTab()

    return [
      {
        id: "tab.new",
        category: "tab",
        title: language.t("command.session.new"),
        keybind: "mod+t,mod+n",
        hidden: true,
        onSelect: openNewTab,
      },
      {
        id: "session.new",
        category: language.t("command.category.session"),
        title: language.t("command.session.new"),
        keybind: "mod+shift+s",
        onSelect: openNewTab,
      },
      current && {
        id: "tab.close",
        category: "tab",
        title: language.t("command.tab.close"),
        keybind: "mod+w",
        hidden: true,
        onSelect: () => {
          tabsStoreActions.closeTab(tabsStore.findIndex((tab) => current === tab))
        },
      },
      {
        id: "tab.reopenClosed",
        category: language.t("command.category.file"),
        title: language.t("command.tab.reopenClosed"),
        keybind: "mod+shift+t",
        onSelect: () => tabsStoreActions.reopenClosedTab(),
      },
    ].filter((v) => v !== undefined)
  })

  return (
    <div
      data-slot="titlebar-v2-tabs"
      class="flex h-10 min-w-0 shrink-0 flex-row items-center gap-1 border-b border-v2-border-border-muted bg-v2-background-bg-base px-2"
    >
      <TitlebarTabStrip
        tabs={tabsStore}
        currentTab={currentTab}
        forceTruncate={tabsAreOverflowing()}
        onOverflowChange={setTabsAreOverflowing}
        onNavigate={(tab, el) => {
          tabs.select(tab)
          if (!el) return
          // Only nudge the horizontal tab scroller. Element.scrollIntoView would
          // also scroll vertical ancestors and jump the strip on first click.
          const scroller = el.closest('[data-slot="titlebar-tabs-scroll"]')
          if (!(scroller instanceof HTMLElement)) return
          const tabRect = el.getBoundingClientRect()
          const box = scroller.getBoundingClientRect()
          if (tabRect.left < box.left) scroller.scrollLeft -= box.left - tabRect.left
          else if (tabRect.right > box.right) scroller.scrollLeft += tabRect.right - box.right
        }}
        onClose={(tab) => {
          const index = tabsStore.findIndex((item) => tabKey(item) === tabKey(tab))
          if (index !== -1) tabsStoreActions.closeTab(index)
        }}
        onReorder={(keys) => tabsStoreActions.reorder(keys)}
      />
      <TooltipV2
        placement="bottom"
        value={
          <>
            {language.t("command.session.new")}
            <KeybindV2 keys={newTabTooltipKeybind(command)} variant="neutral" />
          </>
        }
      >
        <IconButtonV2
          type="button"
          variant="ghost-muted"
          size="large"
          class="shrink-0"
          icon={<IconV2 name="plus" />}
          onClick={openNewTab}
          aria-label={language.t("command.session.new")}
          data-action="titlebar-new-session"
        />
      </TooltipV2>
      <div class="min-w-0 flex-1" data-tauri-drag-region />
    </div>
  )
}
