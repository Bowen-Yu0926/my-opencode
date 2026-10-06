import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const openProject = "C:/OpenCode/OpenProject"
const selectedProject = "C:/OpenCode/SelectedProject"
const projectID = "proj_panel_new_session_project"
const sessionID = "ses_panel_new_session_project"

test.use({ viewport: { width: 1440, height: 900 } })

test("workspace panel new session targets the selected project", async ({ page }) => {
  await mockOpenCodeServer(page, {
    directory: openProject,
    project: {
      id: projectID,
      worktree: openProject,
      vcs: "git",
      name: "OpenProject",
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
    sessions: [
      {
        id: sessionID,
        slug: sessionID,
        projectID,
        directory: openProject,
        title: "Existing session",
        version: "dev",
        time: { created: 1_700_000_000_000, updated: 1_700_000_000_000 },
      },
    ],
    pageMessages: () => ({ items: [] }),
  })

  await page.addInitScript(
    ({ openProject, selectedProject, selection, sessionID }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [],
          projects: {
            local: [
              { worktree: openProject, expanded: true },
              { worktree: selectedProject, expanded: true },
            ],
          },
          lastProject: { local: openProject },
        }),
      )
      localStorage.setItem(
        "opencode.global.dat:layout",
        JSON.stringify({ home: { selection } }),
      )
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify([{ type: "session", server: selection.server, sessionId: sessionID }]),
      )
    },
    { openProject, selectedProject, selection: { server, directory: selectedProject }, sessionID },
  )

  await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)

  const newSessionButton = page.locator('[data-action="workspace-panel-new-session"]')
  await expectAppVisible(newSessionButton)

  const openRow = page.locator(`[data-action="workspace-file-panel-project"][data-worktree="${openProject}"]`)
  const selectedRow = page.locator(
    `[data-action="workspace-file-panel-project"][data-worktree="${selectedProject}"]`,
  )
  await expect(openRow).toBeVisible()
  await expect(selectedRow).toHaveAttribute("aria-current", "page")
  await expect(openRow).not.toHaveAttribute("aria-current", "page")

  await newSessionButton.click()
  await page.waitForURL(/\/new-session\?draftId=/)

  const draftDirectory = () =>
    page.evaluate(() => {
      const tabs = JSON.parse(localStorage.getItem("opencode.window.browser.dat:tabs") ?? "[]")
      const drafts = tabs.filter((tab) => tab.type === "draft")
      return drafts.at(-1)?.directory
    })

  await expect.poll(draftDirectory).toBe(selectedProject)
  await expect(selectedRow).toHaveAttribute("aria-current", "page")
})
