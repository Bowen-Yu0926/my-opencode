import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible, expectSessionTitle } from "../utils/waits"

const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const directory = "C:/OpenCode/SessionUiModeTab"
const projectID = "proj_session_ui_mode_tab"
const projectName = "SessionUiModeTab"
const sessionA = {
  id: "ses_ui_mode_a",
  slug: "ses_ui_mode_a",
  projectID,
  directory,
  title: "Mode tab session A",
  version: "dev",
  time: { created: 1_700_000_000_000, updated: 1_700_000_000_100 },
}
const sessionB = {
  id: "ses_ui_mode_b",
  slug: "ses_ui_mode_b",
  projectID,
  directory,
  title: "Mode tab session B",
  version: "dev",
  time: { created: 1_700_000_000_000, updated: 1_700_000_000_200 },
}

test.use({ viewport: { width: 1440, height: 900 } })

async function setup(page: import("@playwright/test").Page, tabs: Array<{ sessionId: string }>) {
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: projectName,
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
    agents: [
      { name: "ask", mode: "primary" },
      { name: "build", mode: "primary" },
      { name: "plan", mode: "primary" },
    ],
    sessions: [sessionA, sessionB],
    pageMessages: () => ({ items: [] }),
  })

  await page.addInitScript(
    ({ directory, server, tabs }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [],
          projects: { local: [{ worktree: directory, expanded: true }] },
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
    { directory, server, tabs },
  )
}

test("agent picker uses the original dropdown style", async ({ page }) => {
  await setup(page, [{ sessionId: sessionA.id }])
  await page.goto(`/server/${base64Encode(server)}/session/${sessionA.id}`)
  await expectSessionTitle(page, sessionA.title)

  await expect(page.locator('[data-component="prompt-mode-switch"]')).toHaveCount(0)

  const agent = page.getByRole("button", { name: /choose agent|选择智能体/i })
  await expectAppVisible(agent)
  await agent.click()
  await expect(page.getByRole("menuitemradio", { name: /ask/i })).toBeVisible()
  await expect(page.getByRole("menuitemradio", { name: /build/i })).toBeVisible()
  await expect(page.getByRole("menuitemradio", { name: /plan/i })).toBeVisible()
})

test("session tab shows project name and hover-only close", async ({ page }) => {
  await setup(page, [{ sessionId: sessionA.id }])
  await page.goto(`/server/${base64Encode(server)}/session/${sessionA.id}`)
  await expectSessionTitle(page, sessionA.title)

  const tab = page.locator('[data-slot="titlebar-tab-item"]').filter({ hasText: sessionA.title }).first()
  await expect(tab.locator('[data-slot="tab-project"]')).toContainText(projectName)

  const close = tab.locator('[data-slot="tab-close"] button')
  await expect(close).toHaveCSS("opacity", "0")
  await tab.hover()
  await expect(close).not.toHaveCSS("opacity", "0")
})

test("current session row is marked open in current tab", async ({ page }) => {
  await setup(page, [{ sessionId: sessionA.id }])
  await page.goto(`/server/${base64Encode(server)}/session/${sessionA.id}`)
  await expectSessionTitle(page, sessionA.title)

  const row = page.locator('[data-component="project-session-list"] [data-action="project-session-row"]').filter({
    hasText: sessionA.title,
  })
  await expectAppVisible(row)
  await expect(row).toHaveAttribute("title", /当前标签|current tab/i)
})
