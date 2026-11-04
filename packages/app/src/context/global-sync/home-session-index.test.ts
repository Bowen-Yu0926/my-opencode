import { describe, expect, test } from "bun:test"
import { QueryClient } from "@tanstack/solid-query"
import type { Session, SessionV2Info } from "@opencode-ai/sdk/v2/client"
import {
  applyHomeSessionEvent,
  appendHomeSessionEvent,
  createHomeSessionIndexCache,
  HOME_SESSION_INDEX_RETRY_LIMIT,
  HOME_V2_SESSION_PAGE_LIMIT,
  homeSessionIndexLoading,
  homeSessionIndexQueryEnabled,
  homeSessionIndexRetryDelay,
  loadHomeSessionIndex,
  homeSessionIndexSessions,
  homeSessionIndexRefresh,
  parseHomeSessionIndex,
  retainHomeSessions,
  shouldRetryHomeSessionIndex,
} from "./home-session-index"

const session = (input: {
  id: string
  directory?: string
  parentID?: string
  archived?: number
  updated?: number
}) => ({
  id: input.id,
  parentID: input.parentID,
  projectID: "project",
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: input.updated ?? 1, archived: input.archived },
  title: input.id,
  location: { directory: input.directory ?? "/project" },
})

describe("Home V2 session index", () => {
  test("loads the Home index with one global V2 request", async () => {
    const calls: unknown[] = []
    const result = await loadHomeSessionIndex(async (input) => {
      calls.push(input)
      return { data: { data: [session({ id: "root" })], cursor: {} } }
    })

    expect(result.sessions).toHaveLength(1)
    expect(calls).toEqual([{ limit: HOME_V2_SESSION_PAGE_LIMIT, order: "desc" }])
  })

  test("loads subsequent pages until the session index is complete", async () => {
    const calls: unknown[] = []
    const controller = new AbortController()
    const result = await loadHomeSessionIndex(
      async (input, options) => {
        calls.push({ input, signal: options.signal })
        if (!("cursor" in input)) {
          return {
            data: {
              data: Array.from({ length: HOME_V2_SESSION_PAGE_LIMIT }, (_, index) =>
                session({ id: `page-1-${index}` }),
              ),
              cursor: { next: "next-page" },
            },
          }
        }
        return { data: { data: [session({ id: "page-2" })], cursor: {} } }
      },
      0,
      controller.signal,
    )

    expect(result.sessions).toHaveLength(HOME_V2_SESSION_PAGE_LIMIT + 1)
    expect(calls).toEqual([
      { input: { limit: HOME_V2_SESSION_PAGE_LIMIT, order: "desc" }, signal: controller.signal },
      {
        input: { limit: HOME_V2_SESSION_PAGE_LIMIT, order: "desc", cursor: "next-page" },
        signal: controller.signal,
      },
    ])
  })

  test("maps visible roots to Home session summaries", () => {
    const activeNull = {
      ...session({ id: "active-null", updated: 20 }),
      time: { created: 1, updated: 20, archived: null },
    } as unknown as SessionV2Info
    const result = parseHomeSessionIndex([
      session({ id: "root", updated: 30 }),
      activeNull,
      session({ id: "child", parentID: "root", updated: 40 }),
      session({ id: "archived", archived: 50, updated: 50 }),
    ])

    expect(result).toEqual([
      expect.objectContaining({
        id: "root",
        slug: "root",
        version: "",
        directory: "/project",
        projectID: "project",
        title: "root",
        time: { created: 1, updated: 30 },
      }),
      expect.objectContaining({
        id: "active-null",
        time: { created: 1, updated: 20, archived: null },
      }),
    ])
  })

  test("preserves the per-directory Home retention limit", () => {
    const now = 10 * 60 * 60 * 1000
    const sessions = Array.from({ length: 80 }, (_, index) => ({
      ...parseHomeSessionIndex([session({ id: `session-${index}`, updated: index + 1 })])[0],
      directory: index % 2 === 0 ? "/one" : "/two",
    }))

    const retained = retainHomeSessions(sessions, 10, now)
    expect(retained.filter((item) => item.directory === "/one")).toHaveLength(10)
    expect(retained.filter((item) => item.directory === "/two")).toHaveLength(10)
  })

  test("replays session events over the loaded index", () => {
    const initial = parseHomeSessionIndex([session({ id: "old" })])
    const created = { ...initial[0], id: "new", slug: "new", title: "new", time: { created: 2, updated: 2 } }

    const afterCreate = applyHomeSessionEvent(initial, {
      type: "session.created",
      properties: { sessionID: created.id, info: created },
    })
    expect(
      applyHomeSessionEvent(afterCreate, {
        type: "session.deleted",
        properties: { sessionID: initial[0]!.id, info: initial[0]! },
      }),
    ).toEqual([created])
  })

  test("applies only events newer than the index baseline", () => {
    const initial = parseHomeSessionIndex([session({ id: "old" })])
    const stale = { ...initial[0], title: "stale" }
    const current = { ...initial[0], title: "current" }
    const first = appendHomeSessionEvent(undefined, {
      type: "session.updated",
      properties: { sessionID: stale.id, info: stale },
    })
    const events = appendHomeSessionEvent(first, {
      type: "session.updated",
      properties: { sessionID: current.id, info: current },
    })

    expect(homeSessionIndexSessions({ sessions: initial, eventSequence: 1 }, events)[0]?.title).toBe("current")
  })

  test("refetches after reconnect, disposal, and session moves", () => {
    expect(homeSessionIndexRefresh("server.connected", false)).toEqual({ connected: true, refetch: false })
    expect(homeSessionIndexRefresh("server.connected", true)).toEqual({ connected: true, refetch: true })
    expect(homeSessionIndexRefresh("global.disposed", true).refetch).toBe(true)
    expect(homeSessionIndexRefresh("session.next.moved", true).refetch).toBe(true)
  })

  test("removes a session from the loaded Home index", () => {
    const queryClient = new QueryClient()
    const cache = createHomeSessionIndexCache(queryClient, "server")
    const sessions = [
      { id: "a", time: { created: 1, updated: 1 } },
      { id: "b", time: { created: 1, updated: 1 } },
    ] as Session[]
    queryClient.setQueryData(cache.indexKey, { sessions, eventSequence: 0 })

    cache.remove("a")

    const index = queryClient.getQueryData<{ sessions: Session[] }>(cache.indexKey)
    expect(index?.sessions.map((item) => item.id)).toEqual(["b"])
  })

  test("keeps the session out of the Home list when the index is not mounted", () => {
    const queryClient = new QueryClient()
    const cache = createHomeSessionIndexCache(queryClient, "server")
    const sessions = [
      { id: "a", time: { created: 1, updated: 1 } },
      { id: "b", time: { created: 1, updated: 1 } },
    ] as Session[]

    cache.remove("a")

    expect(queryClient.getQueryData(cache.indexKey)).toBeUndefined()
    expect(cache.sessions({ sessions, eventSequence: 0 }, undefined).map((item) => item.id)).toEqual(["b"])
  })

  test("queues create events while the Home index is fetching", async () => {
    const queryClient = new QueryClient()
    const cache = createHomeSessionIndexCache(queryClient, "server")
    const created = {
      id: "new",
      title: "new",
      directory: "/project",
      time: { created: 2, updated: 2 },
    } as Session
    let resolve!: (value: { sessions: Session[]; eventSequence: number }) => void
    const pending = new Promise<{ sessions: Session[]; eventSequence: number }>((next) => {
      resolve = next
    })
    const fetch = queryClient.fetchQuery({
      queryKey: cache.indexKey,
      queryFn: () => pending,
    })

    cache.apply({
      type: "session.created",
      properties: { sessionID: created.id, info: created },
    })

    const events = queryClient.getQueryData<{ sequence: number; entries: Array<{ event: { type: string } }> }>(
      cache.eventsKey,
    )
    expect(events?.sequence).toBe(1)
    expect(events?.entries).toHaveLength(1)
    expect(events?.entries[0]?.event.type).toBe("session.created")

    resolve({ sessions: [], eventSequence: 0 })
    await fetch
  })

  test("adds a created session into the loaded Home index", () => {
    const queryClient = new QueryClient()
    const cache = createHomeSessionIndexCache(queryClient, "server")
    const existing = { id: "old", title: "old", directory: "/project", time: { created: 1, updated: 1 } } as Session
    const created = { id: "new", title: "new", directory: "/project", time: { created: 2, updated: 2 } } as Session
    queryClient.setQueryData(cache.indexKey, { sessions: [existing], eventSequence: 0 })

    cache.apply({
      type: "session.created",
      properties: { sessionID: created.id, info: created },
    })

    const index = queryClient.getQueryData<{ sessions: Session[] }>(cache.indexKey)
    expect(index?.sessions.map((item) => item.id)).toEqual(["old", "new"])
  })
})

describe("Home session index query readiness", () => {
  test("waits for sync.ready before enabling the index query", () => {
    expect(homeSessionIndexQueryEnabled({ hasContext: true, ready: false })).toBe(false)
    expect(homeSessionIndexQueryEnabled({ hasContext: false, ready: true })).toBe(false)
    expect(homeSessionIndexQueryEnabled({ hasContext: true, ready: true })).toBe(true)
  })

  test("keeps the list in a loading state until sync is ready", () => {
    expect(
      homeSessionIndexLoading({
        ready: false,
        isLoading: false,
        isError: false,
      }),
    ).toBe(true)
    expect(
      homeSessionIndexLoading({
        ready: true,
        isLoading: true,
        isError: false,
      }),
    ).toBe(true)
    expect(
      homeSessionIndexLoading({
        ready: true,
        isLoading: false,
        isError: false,
      }),
    ).toBe(false)
    expect(
      homeSessionIndexLoading({
        ready: true,
        isLoading: false,
        isError: true,
      }),
    ).toBe(false)
  })

  test("retries cold-start session list failures with backoff", () => {
    expect(shouldRetryHomeSessionIndex(0, new Error("fetch failed"))).toBe(true)
    expect(shouldRetryHomeSessionIndex(HOME_SESSION_INDEX_RETRY_LIMIT - 1, new Error("Failed to fetch"))).toBe(true)
    expect(shouldRetryHomeSessionIndex(HOME_SESSION_INDEX_RETRY_LIMIT, new Error("fetch failed"))).toBe(false)
    expect(shouldRetryHomeSessionIndex(0, new Error("Permission denied"))).toBe(false)
    expect(homeSessionIndexRetryDelay(0)).toBe(250)
    expect(homeSessionIndexRetryDelay(1)).toBe(500)
    expect(homeSessionIndexRetryDelay(3)).toBe(2000)
  })
})
