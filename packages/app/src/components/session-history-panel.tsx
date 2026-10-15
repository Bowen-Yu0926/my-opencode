import type { Session } from "@opencode-ai/sdk/v2/client"
import { useQuery } from "@tanstack/solid-query"
import { For, Show, createMemo, createSignal } from "solid-js"
import { DateTime } from "luxon"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { useGlobal } from "@/context/global"
import { useLayout } from "@/context/layout"
import { ServerConnection, useServer } from "@/context/server"
import { useLanguage } from "@/context/language"
import { sessionHasOpenTab, useTabs } from "@/context/tabs"
import { loadHomeSessionIndex, retainHomeSessions, type HomeSessionEvents } from "@/context/global-sync/home-session-index"
import { sessionsForActiveProject } from "@/pages/layout/helpers"
import { sessionTitle } from "@/utils/session-title"
import { showToast } from "@/utils/toast"

const LIMIT = 50

function groupByDay(sessions: Session[], language: ReturnType<typeof useLanguage>): { title: string; sessions: Session[] }[] {
  const now = DateTime.local()
  const yesterday = now.minus({ days: 1 })
  const today = sessions.filter((s) =>
    DateTime.fromMillis(s.time.updated ?? s.time.created).hasSame(now, "day"),
  )
  const yesterdaySessions = sessions.filter((s) =>
    DateTime.fromMillis(s.time.updated ?? s.time.created).hasSame(yesterday, "day"),
  )
  const older = sessions.filter((s) => {
    const time = DateTime.fromMillis(s.time.updated ?? s.time.created)
    return !time.hasSame(now, "day") && !time.hasSame(yesterday, "day")
  })
  return [
    { title: language.t("home.sessions.group.today"), sessions: today },
    { title: language.t("home.sessions.group.yesterday"), sessions: yesterdaySessions },
    { title: language.t("home.sessions.group.older"), sessions: older },
  ].filter((g) => g.sessions.length > 0)
}

export function SessionHistoryList() {
  const language = useLanguage()
  const server = useServer()
  const global = useGlobal()
  const tabs = useTabs()
  const layout = useLayout()

  const ctx = createMemo(() => (server.current ? global.ensureServerCtx(server.current) : undefined))

  const projects = createMemo(() => {
    const key = layout.home.selection().server
    const conn = global.servers.list().find((item) => ServerConnection.key(item) === key) ?? server.current
    return conn ? global.ensureServerCtx(conn).projects.list() : []
  })

  const events = useQuery(() => ({
    queryKey: ctx()?.sync.homeSessions.eventsKey ?? ["home-sessions-events"],
    queryFn: async (): Promise<HomeSessionEvents> => ({ sequence: 0, entries: [] }),
    initialData: { sequence: 0, entries: [] } satisfies HomeSessionEvents,
    enabled: false,
  }))

  const sessionLoad = useQuery(() => ({
    queryKey: ctx()?.sync.homeSessions.indexKey ?? ["home-sessions-index"],
    enabled: !!ctx(),
    queryFn: async ({ signal }) => {
      const active = ctx()
      if (!active) return { sessions: [], eventSequence: 0 }
      const cache = active.sync.homeSessions
      const eventSequence = cache.eventSequence()
      const index = await loadHomeSessionIndex(
        (input, options) => active.sdk.client.v2.session.list(input, options),
        eventSequence,
        signal,
      )
      cache.complete(eventSequence)
      return index
    },
    retry: false,
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnReconnect: true,
  }))

  const records = createMemo(() => {
    const active = ctx()
    if (!active) return []
    const cache = active.sync.homeSessions
    const list = cache.sessions(sessionLoad.data, events.data)
    const scoped = sessionsForActiveProject(list, projects(), layout.home.selection().directory)
    return retainHomeSessions(scoped, LIMIT, Date.now()).slice(0, LIMIT)
  })

  const groups = createMemo(() => groupByDay(records(), language))

  function open(session: Session) {
    const conn = server.current
    if (!conn) return
    const key = ServerConnection.key(conn)
    tabs.addSessionTab({ server: key, sessionId: session.id })
    tabs.select({ type: "session", server: key, sessionId: session.id })
  }

  async function rename(session: Session, title: string) {
    const active = ctx()
    if (!active) return
    try {
      await active.sdk.api.session.rename({ sessionID: session.id, title })
    } catch (err) {
      showToast({
        title: language.t("common.requestFailed"),
        description: err instanceof Error ? err.message : undefined,
      })
      throw err
    }
    active.sync.homeSessions.apply({
      type: "session.updated",
      properties: { sessionID: session.id, info: { ...session, title } },
    })
  }

  return (
    <Show
      when={!sessionLoad.isLoading}
      fallback={
        <div class="px-1.5 py-2 text-[13px] leading-4 text-v2-text-text-muted [font-weight:440]">
          {language.t("common.loading")}
        </div>
      }
    >
      <Show
        when={groups().length > 0}
        fallback={
          <div class="px-1.5 py-2 text-[13px] leading-4 text-v2-text-text-muted [font-weight:440]">
            {language.t("home.sessions.empty")}
          </div>
        }
      >
        <div class="flex flex-col gap-3">
          <For each={groups()}>
            {(group) => (
              <div class="flex flex-col gap-0.5">
                <div class="flex h-6 min-w-0 shrink-0 items-center px-1.5 text-[13px] leading-4 text-v2-text-text-faint [font-weight:530]">
                  {group.title}
                </div>
                <For each={group.sessions}>
                  {(session) => (
                    <SessionRow
                      session={session}
                      open={
                        !!server.current &&
                        sessionHasOpenTab(tabs.store, ServerConnection.key(server.current!), session)
                      }
                      onOpen={() => open(session)}
                      onRename={(title) => rename(session, title)}
                    />
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Show>
  )
}

function SessionRow(props: {
  session: Session
  open: boolean
  onOpen: () => void
  onRename: (title: string) => Promise<void>
}) {
  const language = useLanguage()
  const title = createMemo(() => sessionTitle(props.session.title) || props.session.id)
  const time = createMemo(() => {
    const ms = props.session.time.updated ?? props.session.time.created
    return DateTime.fromMillis(ms).toLocaleString({ hour: "numeric", minute: "2-digit" })
  })
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal("")
  const [pending, setPending] = createSignal(false)
  let input: HTMLInputElement | undefined

  const startRename = () => {
    if (editing()) return
    setDraft(title())
    setEditing(true)
    requestAnimationFrame(() => {
      input?.focus()
      input?.select()
    })
  }

  const cancelRename = () => {
    if (pending()) return
    setEditing(false)
  }

  const saveRename = () => {
    if (!editing() || pending()) return
    const next = draft().trim()
    if (!next || next === title()) {
      setEditing(false)
      return
    }
    setPending(true)
    props
      .onRename(next)
      .then(() => setEditing(false))
      .catch(() => {})
      .finally(() => setPending(false))
  }

  return (
    <div class="group/session relative flex min-w-0 items-center rounded-[6px]">
      <Show
        when={!editing()}
        fallback={
          <div class="flex w-full min-w-0 flex-col gap-0.5 rounded-[6px] bg-v2-overlay-simple-overlay-hover px-2 py-1.5 outline outline-1 outline-v2-border-border-focus">
            <input
              ref={(el) => {
                input = el
              }}
              value={draft()}
              disabled={pending()}
              data-slot="session-history-rename-input"
              aria-label={language.t("common.rename")}
              class="w-full min-w-0 border-0 bg-transparent p-0 text-[13px] leading-4 tracking-[-0.04px] text-v2-text-text-base [font-weight:530] outline-none"
              onInput={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.isComposing || event.keyCode === 229) return
                if (event.key === "Enter") {
                  event.preventDefault()
                  saveRename()
                  return
                }
                if (event.key === "Escape") {
                  event.preventDefault()
                  cancelRename()
                }
              }}
              onBlur={saveRename}
            />
            <span class="text-[12px] leading-4 text-v2-text-text-muted [font-weight:400]">{time()}</span>
          </div>
        }
      >
        <button
          type="button"
          class="flex h-9 w-full min-w-0 items-center gap-2 rounded-[6px] border-0 bg-transparent pl-1.5 pr-9 text-left
            text-v2-text-text-muted [font-weight:530] transition-[background-color,color] duration-[120ms] ease-in-out
            hover:bg-v2-background-bg-layer-02 hover:text-v2-text-text-base
            focus-visible:bg-v2-background-bg-layer-02 focus-visible:text-v2-text-text-base focus-visible:outline-none
            focus-visible:[box-shadow:inset_0_0_0_0.5px_var(--v2-border-border-muted)]"
          classList={{
            "bg-v2-background-bg-layer-03 text-v2-text-text-base": props.open,
            "hover:bg-v2-background-bg-layer-02": props.open,
          }}
          onClick={props.onOpen}
        >
          <div class="flex min-w-0 flex-1 flex-col gap-px">
            <span class="min-w-0 truncate text-[13px] leading-4 tracking-[-0.04px]">{title()}</span>
            <span class="text-[12px] leading-3 text-v2-text-text-faint [font-weight:400]">{time()}</span>
          </div>
        </button>
        <div
          class="hover-reveal absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center
            group-hover/session:opacity-100 focus-within:opacity-100"
        >
          <TooltipV2 class="flex shrink-0 items-center" placement="right" value={language.t("common.rename")}>
            <IconButtonV2
              variant="ghost-muted"
              size="normal"
              icon={<IconV2 name="edit" />}
              aria-label={language.t("common.rename")}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                startRename()
              }}
            />
          </TooltipV2>
        </div>
      </Show>
    </div>
  )
}
