import type { Session } from "@opencode-ai/sdk/v2/client"
import { useQuery } from "@tanstack/solid-query"
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import { DateTime } from "luxon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon as IconV2 } from "@opencode-ai/ui/v2/icon"
import { IconButtonV2 } from "@opencode-ai/ui/v2/icon-button-v2"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { DialogFooter, DialogHeader, DialogTitleGroup, DialogV2 } from "@opencode-ai/ui/v2/dialog-v2"
import { MenuV2 } from "@opencode-ai/ui/v2/menu-v2"
import { TooltipV2 } from "@opencode-ai/ui/v2/tooltip-v2"
import { notifySessionTabsRemoved } from "@/components/titlebar-session-events"
import { useGlobal } from "@/context/global"
import { useLayout } from "@/context/layout"
import { ServerConnection, useServer } from "@/context/server"
import { useLanguage } from "@/context/language"
import { sessionHasOpenTab, useTabs } from "@/context/tabs"
import { loadHomeSessionIndex, retainHomeSessions, type HomeSessionEvents } from "@/context/global-sync/home-session-index"
import { projectForSession, sessionsForActiveProject } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import { sessionTitle } from "@/utils/session-title"
import { showToast } from "@/utils/toast"

const LIMIT = 50
const PROJECT_LIMIT = 12

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

export function createHomeSessionSource() {
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

  const allSessions = createMemo(() => {
    const active = ctx()
    if (!active) return [] as Session[]
    const cache = active.sync.homeSessions
    return cache.sessions(sessionLoad.data, events.data)
  })

  function open(session: Session) {
    const conn = server.current
    if (!conn) return
    const key = ServerConnection.key(conn)
    const project = projectForSession(session, projects())
    const directory = project?.worktree ?? session.directory
    layout.home.setSelection({ server: key, directory })
    const active = ctx()
    if (active) {
      active.projects.open(directory)
      active.projects.touch(directory)
      active.sync.child(directory)
    }
    tabs.openSessionTab({ server: key, sessionId: session.id })
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

  async function remove(session: Session) {
    const active = ctx()
    const conn = server.current
    if (!active || !conn) return
    try {
      await active.sdk.api.session.remove({ sessionID: session.id, directory: session.directory })
    } catch (err) {
      showToast({
        title: language.t("session.delete.failed.title"),
        description: err instanceof Error ? err.message : undefined,
      })
      throw err
    }
    active.sync.homeSessions.apply({
      type: "session.deleted",
      properties: { sessionID: session.id, info: session },
    })
    active.sync.homeSessions.remove(session.id)
    notifySessionTabsRemoved({
      server: ServerConnection.key(conn),
      directory: session.directory,
      sessionIDs: [session.id],
    })
  }

  const isOpen = (session: Session) =>
    !!server.current && sessionHasOpenTab(tabs.store, ServerConnection.key(server.current!), session)

  return {
    language,
    loading: () => sessionLoad.isLoading,
    projects,
    allSessions,
    open,
    rename,
    remove,
    isOpen,
  }
}

export function SessionHistoryList() {
  const source = createHomeSessionSource()
  const layout = useLayout()

  const records = createMemo(() =>
    retainHomeSessions(
      sessionsForActiveProject(source.allSessions(), source.projects(), layout.home.selection().directory),
      LIMIT,
      Date.now(),
    ).slice(0, LIMIT),
  )

  const groups = createMemo(() => groupByDay(records(), source.language))

  return (
    <Show
      when={!source.loading()}
      fallback={
        <div class="px-1.5 py-2 text-[13px] leading-4 text-v2-text-text-muted [font-weight:440]">
          {source.language.t("common.loading")}
        </div>
      }
    >
      <Show
        when={groups().length > 0}
        fallback={
          <div class="px-1.5 py-2 text-[13px] leading-4 text-v2-text-text-muted [font-weight:440]">
            {source.language.t("home.sessions.empty")}
          </div>
        }
      >
        <div class="flex flex-col gap-2">
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
                      open={source.isOpen(session)}
                      onOpen={() => source.open(session)}
                      onRename={(title) => source.rename(session, title)}
                      onDelete={() => source.remove(session)}
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

type HomeSessionSource = ReturnType<typeof createHomeSessionSource>

/** Flat recent sessions for a single project, used under the left workspace project row. */
export function ProjectSessionList(props: {
  worktree: string
  sandboxes?: string[]
  limit?: number
  source: HomeSessionSource
}) {
  const directories = createMemo(() => [props.worktree, ...(props.sandboxes ?? [])].map(pathKey))

  const sessions = createMemo(() => {
    const keys = directories()
    const scoped = props.source.allSessions().filter((session) => keys.includes(pathKey(session.directory)))
    return retainHomeSessions(scoped, props.limit ?? PROJECT_LIMIT, Date.now()).slice(
      0,
      props.limit ?? PROJECT_LIMIT,
    )
  })

  return (
    <Show when={!props.source.loading()}>
      <Show when={sessions().length > 0}>
        <div class="mb-0.5 ml-[18px] flex flex-col gap-px border-l border-v2-border-border-muted pl-2" data-component="project-session-list">
          <For each={sessions()}>
            {(session) => (
              <SessionRow
                compact
                session={session}
                open={props.source.isOpen(session)}
                onOpen={() => props.source.open(session)}
                onRename={(title) => props.source.rename(session, title)}
                onDelete={() => props.source.remove(session)}
              />
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
  compact?: boolean
  onOpen: () => void
  onRename: (title: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const language = useLanguage()
  const dialog = useDialog()
  const title = createMemo(() => sessionTitle(props.session.title) || props.session.id)
  const time = createMemo(() => {
    const ms = props.session.time.updated ?? props.session.time.created
    return DateTime.fromMillis(ms).toLocaleString({ hour: "numeric", minute: "2-digit" })
  })
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal("")
  const [pending, setPending] = createSignal(false)
  let input: HTMLInputElement | undefined
  let row: HTMLButtonElement | undefined
  let renameRequested = false

  createEffect(() => {
    if (!props.open || !row) return
    row.scrollIntoView({ block: "nearest" })
  })

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

  const confirmDelete = () => {
    const name = title()
    void dialog.show(() => (
      <DialogV2 fit>
        <DialogHeader hideClose>
          <DialogTitleGroup
            title={language.t("session.delete.title")}
            description={language.t("session.delete.confirm", { name })}
          />
        </DialogHeader>
        <DialogFooter>
          <ButtonV2 variant="ghost" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </ButtonV2>
          <ButtonV2
            variant="danger"
            onClick={() => {
              void props
                .onDelete()
                .then(() => dialog.close())
                .catch(() => dialog.close())
            }}
          >
            {language.t("session.delete.button")}
          </ButtonV2>
        </DialogFooter>
      </DialogV2>
    ))
  }

  return (
    <div class="group/session relative flex min-w-0 items-center">
      <Show
        when={!editing()}
        fallback={
          <div class="flex w-full min-w-0 flex-col gap-0.5 rounded-[6px] bg-v2-overlay-simple-overlay-hover px-2 py-1 outline outline-1 outline-v2-border-border-focus">
            <input
              ref={(el) => {
                input = el
              }}
              value={draft()}
              disabled={pending()}
              data-slot="session-history-rename-input"
              aria-label={language.t("common.rename")}
              class="w-full min-w-0 border-0 bg-transparent p-0 text-[12px] leading-4 tracking-[-0.02px] text-v2-text-text-base [font-weight:530] outline-none"
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
            <Show when={!props.compact}>
              <span class="text-[12px] leading-4 text-v2-text-text-muted [font-weight:400]">{time()}</span>
            </Show>
          </div>
        }
      >
        <MenuV2.Context>
          <MenuV2.Context.Trigger
            ref={(el: HTMLButtonElement) => {
              row = el
            }}
            as="button"
            type="button"
            title={language.t("session.list.openInCurrentTab")}
            data-action="project-session-row"
            classList={{
              "flex w-full min-w-0 items-center border-0 bg-transparent text-left transition-[background-color,color] duration-100 ease-out focus-visible:outline-none":
                true,
              "h-7 gap-1.5 rounded-[5px] px-1.5 pr-6 text-v2-text-text-muted [font-weight:440] hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:bg-v2-overlay-simple-overlay-hover":
                !!props.compact,
              "h-9 gap-2 rounded-[6px] px-1.5 pr-9 text-v2-text-text-muted [font-weight:530] hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base focus-visible:bg-v2-overlay-simple-overlay-hover":
                !props.compact,
              "bg-v2-overlay-simple-overlay-hover text-v2-text-text-base [font-weight:530]": props.open,
            }}
            onClick={props.onOpen}
          >
            <Show
              when={props.compact}
              fallback={
                <div class="flex min-w-0 flex-1 flex-col gap-px">
                  <span class="min-w-0 truncate text-[13px] leading-4 tracking-[-0.04px]">{title()}</span>
                  <span class="text-[12px] leading-3 text-v2-text-text-faint [font-weight:400]">{time()}</span>
                </div>
              }
            >
              <span
                class="size-1 shrink-0 rounded-full bg-v2-border-border-strong"
                classList={{ "bg-v2-background-bg-accent": props.open }}
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1 truncate text-[13px] leading-5 tracking-[-0.01em]">{title()}</span>
            </Show>
          </MenuV2.Context.Trigger>
          <MenuV2.Context.Portal>
            <MenuV2.Context.Content
              onCloseAutoFocus={(event) => {
                if (!renameRequested) return
                event.preventDefault()
                renameRequested = false
                requestAnimationFrame(() => startRename())
              }}
            >
              <MenuV2.Item
                onSelect={() => {
                  renameRequested = true
                }}
              >
                {language.t("common.rename")}
              </MenuV2.Item>
              <MenuV2.Item onSelect={confirmDelete}>{language.t("session.delete.button")}</MenuV2.Item>
            </MenuV2.Context.Content>
          </MenuV2.Context.Portal>
        </MenuV2.Context>
        <div class="absolute right-0.5 top-1/2 flex -translate-y-1/2 items-center opacity-0 transition-opacity duration-100 group-hover/session:opacity-100 focus-within:opacity-100">
          <TooltipV2 class="flex shrink-0 items-center" placement="right" value={language.t("common.rename")}>
            <IconButtonV2
              variant="ghost-muted"
              size="small"
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
