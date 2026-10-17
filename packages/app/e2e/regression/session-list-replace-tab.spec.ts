import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible, expectSessionTitle } from "../utils/waits"

const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const directory = "C:/OpenCode/SessionListReplaceTab"
const projectID = "proj_session_list_replace_tab"
const sessionA = {
  id: "ses_replace_tab_a",
  slug: "ses_replace_tab_a",
  projectID,
  directory,
  title: "Replace tab session A",
  version: "dev",
  time: { created: 1_700_000_000_000, updated: 1_700_000_000_100 },
}
const sessionB = {
  id: "ses_replace_tab_b",
  slug: "ses_replace_tab_b",
  projectID,
  directory,
  title: "Replace tab session B",
  version: "dev",
  time: { created: 1_700_000_000_000, updated: 1_700_000_000_200 },
}
const sessionC = {
  id: "ses_replace_tab_c",
  slug: "ses_replace_tab_c",
  projectID,
  directory,
  title: "Replace tab session C",
  version: "dev",
  time: { created: 1_700_000_000_000, updated: 1_700_000_000_300 },
}
const otherDirectory = "C:/OpenCode/SessionListReplaceTabOther"
const otherProjectID = "proj_session_list_replace_tab_other"
const sessionOther = {
  id: "ses_replace_tab_other",
  slug: "ses_replace_tab_other",
  projectID: otherProjectID,
  directory: otherDirectory,
  title: "Replace tab session other project",
  version: "dev",
  time: { created: 1_700_000_000_000, updated: 1_700_000_000_400 },
}

test.use({ viewport: { width: 1440, height: 900 } })

async function setup(
  page: import("@playwright/test").Page,
  tabs: Array<{ sessionId: string }>,
  options?: { projects?: Array<{ worktree: string }>; sessions?: Array<{ id: string }> },
) {
  const projects = options?.projects ?? [{ worktree: directory }]
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "SessionListReplaceTab",
      time: { created: 1_700_000_000_000, updated: 1_700_000_000_000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: {
            test: { id: "test", name: "Test", limit: { context: 200_000 } },
          },
        },
      ],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "test" },
    },
    sessions: [...[sessionA, sessionB, sessionC], ...(options?.sessions ?? [])],
    pageMessages: () => ({ items: [] }),
  })

  await page.addInitScript(
    ({ directory, server, tabs, projects }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [],
          projects: { local: projects.map((project) => ({ worktree: project.worktree, expanded: true })) },
          lastProject: { local: directory },
        }),
      )
      localStorage.setItem(
        "opencode.global.dat:layout",
        JSON.stringify({ home: { selection: { server, directory } } }),
      )
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify(tabs.map((tab) => ({ type: "session", server, sessionId: tab.sessionId }))),
      )
    },
    { directory, server, tabs, projects },
  )
}

const titlebarTabs = (page: import("@playwright/test").Page) =>
  page.locator('[data-slot="titlebar-tabs"] a[data-titlebar-tab-link]')

test("workspace session list replaces the active tab instead of opening another", async ({ page }) => {
  await setup(page, [{ sessionId: sessionA.id }])
  await page.goto(`/server/${base64Encode(server)}/session/${sessionA.id}`)
  await expectSessionTitle(page, sessionA.title)
  await expect(titlebarTabs(page)).toHaveCount(1)
  await expect(titlebarTabs(page)).toContainText(sessionA.title)

  const list = page.locator('[data-component="project-session-list"]')
  await expectAppVisible(list)
  await list.locator('[data-action="project-session-row"]').filter({ hasText: sessionB.title }).click()

  await expectSessionTitle(page, sessionB.title)
  await expect(page).toHaveURL(new RegExp(`/session/${sessionB.id}$`))
  await expect(titlebarTabs(page)).toHaveCount(1)
  await expect(titlebarTabs(page)).toContainText(sessionB.title)
  await expect(titlebarTabs(page).filter({ hasText: sessionA.title })).toHaveCount(0)
})

test("workspace session list switches to an already-open tab without adding one", async ({ page }) => {
  await setup(page, [{ sessionId: sessionA.id }, { sessionId: sessionB.id }])
  await page.goto(`/server/${base64Encode(server)}/session/${sessionA.id}`)
  await expectSessionTitle(page, sessionA.title)
  await expect(titlebarTabs(page)).toHaveCount(2)

  const list = page.locator('[data-component="project-session-list"]')
  await expectAppVisible(list)
  await list.locator('[data-action="project-session-row"]').filter({ hasText: sessionB.title }).click()

  await expectSessionTitle(page, sessionB.title)
  await expect(page).toHaveURL(new RegExp(`/session/${sessionB.id}$`))
  await expect(titlebarTabs(page)).toHaveCount(2)
  await expect(titlebarTabs(page).filter({ hasText: sessionA.title })).toHaveCount(1)
  await expect(titlebarTabs(page).filter({ hasText: sessionB.title })).toHaveCount(1)
})

test("workspace session list replaces only the active tab when others stay open", async ({ page }) => {
  await setup(page, [{ sessionId: sessionA.id }, { sessionId: sessionB.id }])
  await page.goto(`/server/${base64Encode(server)}/session/${sessionA.id}`)
  await expectSessionTitle(page, sessionA.title)
  await expect(titlebarTabs(page)).toHaveCount(2)

  const list = page.locator('[data-component="project-session-list"]')
  await expectAppVisible(list)
  await list.locator('[data-action="project-session-row"]').filter({ hasText: sessionC.title }).click()

  await expectSessionTitle(page, sessionC.title)
  await expect(page).toHaveURL(new RegExp(`/session/${sessionC.id}$`))
  await expect(titlebarTabs(page)).toHaveCount(2)
  await expect(titlebarTabs(page).filter({ hasText: sessionC.title })).toHaveCount(1)
  await expect(titlebarTabs(page).filter({ hasText: sessionB.title })).toHaveCount(1)
  await expect(titlebarTabs(page).filter({ hasText: sessionA.title })).toHaveCount(0)
})

test("workspace session list opens a session from another project in a new tab", async ({ page }) => {
  await setup(page, [{ sessionId: sessionA.id }], {
    projects: [{ worktree: directory }, { worktree: otherDirectory }],
    sessions: [sessionOther],
  })
  await page.goto(`/server/${base64Encode(server)}/session/${sessionA.id}`)
  await expectSessionTitle(page, sessionA.title)
  await expect(titlebarTabs(page)).toHaveCount(1)
  await expect(titlebarTabs(page)).toContainText(sessionA.title)

  await page.locator('[data-action="workspace-file-panel-project"]').filter({ hasText: otherDirectory }).click()

  const otherList = page.locator('[data-component="project-session-list"]')
  await expectAppVisible(otherList)
  await otherList.locator('[data-action="project-session-row"]').filter({ hasText: sessionOther.title }).click()

  await expectSessionTitle(page, sessionOther.title)
  await expect(page).toHaveURL(new RegExp(`/session/${sessionOther.id}$`))
  await expect(titlebarTabs(page)).toHaveCount(2)
  await expect(titlebarTabs(page).filter({ hasText: sessionA.title })).toHaveCount(1)
  await expect(titlebarTabs(page).filter({ hasText: sessionOther.title })).toHaveCount(1)
})
