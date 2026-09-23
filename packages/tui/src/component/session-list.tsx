import { For, Show, createEffect, createMemo, createSignal, on } from "solid-js"
import { useSync } from "../context/sync"
import { selectedForeground, useTheme } from "../context/theme"
import { useRoute } from "../context/route"
import { useLocal } from "../context/local"
import { useKV } from "../context/kv"
import { useTuiConfig } from "../config"
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import type { Session } from "@opencode-ai/sdk/v2"
import { Locale } from "../util/locale"
import { getScrollAcceleration } from "../util/scroll"
import { useBindings } from "../keymap"
import { Spinner } from "./spinner"

export const SESSION_LIST_WIDTH = 40

export function useSessionListVisibility() {
  const kv = useKV()
  const [mode, setMode] = kv.signal<"auto" | "show" | "hide">("session_list", "auto")
  const visible = createMemo(() => {
    const value = mode()
    if (value === "show") return true
    if (value === "hide") return false
    return true
  })
  function toggle() {
    setMode(() => (visible() ? "hide" : "show"))
  }
  return { visible, toggle }
}

export function SessionList() {
  const sync = useSync()
  const { theme } = useTheme()
  const route = useRoute()
  const local = useLocal()
  const tuiConfig = useTuiConfig()
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))
  const [focused, setFocused] = createSignal(false)
  const [hover, setHover] = createSignal<string>()
  const [selected, setSelected] = createSignal<string>()
  let scroll: ScrollBoxRenderable | undefined

  const current = createMemo(() => (route.data.type === "session" ? route.data.sessionID : undefined))

  const sessions = createMemo(() =>
    sync.data.session
      .filter((x) => x.parentID === undefined)
      .toSorted((a, b) => b.time.updated - a.time.updated),
  )

  const groups = createMemo(() => {
    const today = new Date().toDateString()
    const pinned = new Set(local.session.pinned())
    const map = new Map<string, Session[]>()
    for (const session of sessions()) {
      const label = pinned.has(session.id)
        ? "Pinned"
        : new Date(session.time.updated).toDateString() === today
          ? "Today"
          : new Date(session.time.updated).toDateString()
      const list = map.get(label) ?? []
      list.push(session)
      map.set(label, list)
    }
    return [...map.entries()]
  })

  const flat = createMemo(() => groups().flatMap(([, list]) => list))

  const fg = selectedForeground(theme)

  function open(sessionID: string) {
    setFocused(false)
    if (route.data.type === "session" && route.data.sessionID === sessionID) return
    route.navigate({ type: "session", sessionID })
  }

  function scrollTo(sessionID: string, center = false) {
    if (!scroll) return
    const target = scroll.getChildren().find((child) => child.id === sessionID)
    if (!target) return
    const y = target.y - scroll.y
    if (center) {
      scroll.scrollBy(y - Math.floor(scroll.height / 2))
      return
    }
    if (y >= scroll.height) scroll.scrollBy(y - scroll.height + 1)
    if (y < 0) scroll.scrollBy(y)
  }

  function move(direction: number) {
    const list = flat()
    if (list.length === 0) return
    const index = list.findIndex((x) => x.id === selected())
    const next = index === -1 ? 0 : (index + direction + list.length) % list.length
    const sessionID = list[next].id
    setSelected(sessionID)
    scrollTo(sessionID)
  }

  useBindings(() => ({
    enabled: () => focused(),
    bindings: [
      { key: "up", desc: "Previous session", group: "Session List", cmd: () => move(-1) },
      { key: "down", desc: "Next session", group: "Session List", cmd: () => move(1) },
      { key: "pageup", desc: "Previous page", group: "Session List", cmd: () => move(-10) },
      { key: "pagedown", desc: "Next page", group: "Session List", cmd: () => move(10) },
      {
        key: "home",
        desc: "First session",
        group: "Session List",
        cmd: () => {
          const first = flat()[0]
          if (!first) return
          setSelected(first.id)
          scrollTo(first.id)
        },
      },
      {
        key: "end",
        desc: "Last session",
        group: "Session List",
        cmd: () => {
          const last = flat().at(-1)
          if (!last) return
          setSelected(last.id)
          scrollTo(last.id)
        },
      },
      {
        key: "return",
        desc: "Open session",
        group: "Session List",
        cmd: () => {
          const id = selected()
          if (!id) return
          open(id)
        },
      },
      { key: "escape", desc: "Leave session list", group: "Session List", cmd: () => setFocused(false) },
    ],
  }))

  createEffect(
    on(current, (sessionID) => {
      if (!sessionID) return
      setSelected(sessionID)
      setTimeout(() => scrollTo(sessionID), 0)
    }),
  )

  return (
    <box
      width={SESSION_LIST_WIDTH}
      height="100%"
      flexShrink={0}
      flexDirection="column"
      backgroundColor={theme.backgroundPanel}
      paddingTop={1}
      paddingBottom={1}
      border={["right"]}
      borderColor={focused() ? theme.borderActive : theme.border}
      onMouseUp={() => setFocused(true)}
    >
      <box flexShrink={0} flexDirection="row" justifyContent="space-between" paddingLeft={2} paddingRight={2}>
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Sessions
        </text>
        <text fg={theme.textMuted}>{sessions().length}</text>
      </box>
      <scrollbox
        flexGrow={1}
        ref={(r: ScrollBoxRenderable) => (scroll = r)}
        scrollAcceleration={scrollAcceleration()}
        verticalScrollbarOptions={{
          trackOptions: {
            backgroundColor: theme.background,
            foregroundColor: theme.borderActive,
          },
        }}
      >
        <For each={groups()}>
          {([label, list]) => (
            <>
              <box paddingLeft={2} paddingTop={1} flexShrink={0}>
                <text fg={theme.accent} attributes={TextAttributes.BOLD}>
                  {label}
                </text>
              </box>
              <For each={list}>
                {(session) => {
                  const isCurrent = createMemo(() => current() === session.id)
                  const active = createMemo(
                    () => (hover() === session.id || (focused() && selected() === session.id)) && !isCurrent(),
                  )
                  const status = createMemo(() => sync.data.session_status?.[session.id])
                  const working = createMemo(() => {
                    const value = status()
                    return value?.type === "busy" || value?.type === "retry"
                  })
                  return (
                    <box
                      id={session.id}
                      flexDirection="row"
                      flexShrink={0}
                      paddingLeft={1}
                      paddingRight={2}
                      gap={1}
                      backgroundColor={active() ? theme.backgroundElement : undefined}
                      onMouseOver={() => setHover(session.id)}
                      onMouseOut={() => setHover(undefined)}
                      onMouseUp={() => open(session.id)}
                    >
                      <Show when={working()}>
                        <Spinner />
                      </Show>
                      <Show when={!working()}>
                        <text fg={isCurrent() ? theme.primary : theme.textMuted} flexShrink={0}>
                          {isCurrent() ? "●" : " "}
                        </text>
                      </Show>
                      <text
                        fg={isCurrent() ? theme.primary : active() ? fg : theme.text}
                        attributes={isCurrent() ? TextAttributes.BOLD : undefined}
                        wrapMode="none"
                        overflow="hidden"
                        flexGrow={1}
                      >
                        {Locale.truncate(session.title, SESSION_LIST_WIDTH - 8)}
                      </text>
                    </box>
                  )
                }}
              </For>
            </>
          )}
        </For>
        <Show when={sessions().length === 0}>
          <box paddingLeft={2} paddingRight={2} paddingTop={1}>
            <text fg={theme.textMuted}>No sessions yet</text>
          </box>
        </Show>
      </scrollbox>
    </box>
  )
}
