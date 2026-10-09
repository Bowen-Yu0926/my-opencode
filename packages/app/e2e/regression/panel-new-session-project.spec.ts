import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectAppVisible } from "../utils/waits"

const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
const openProject = "C:/OpenCode/OpenProject"
const selectedProject = "C:/OpenCode/SelectedProject"
const pickedDirectory = String.raw`C:\OpenCode\brandnew`
const pickedSelector = pickedDirectory.replaceAll("\\", "\\\\")
const projectID = "proj_panel_new_session_project"
const sessionID = "ses_panel_new_session_project"

test.use({ viewport: { width: 1440, height: 900 } })

async function setup(page: import("@playwright/test").Page) {
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
    fileList: () => [],
    findFiles: ({ query }) => (query === "brandnew" ? ["brandnew"] : []),
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
      localStorage.setItem("opencode.global.dat:layout", JSON.stringify({ home: { selection } }))
      localStorage.setItem(
        "opencode.window.browser.dat:tabs",
        JSON.stringify([{ type: "session", server: selection.server, sessionId: sessionID }]),
      )
    },
    { openProject, selectedProject, selection: { server, directory: selectedProject }, sessionID },
  )

  await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
}

const draftDirectory = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem("opencode.window.browser.dat:tabs") ?? "[]")
    const drafts = tabs.filter((tab) => tab.type === "draft")
    return drafts.at(-1)?.directory
  })

test("workspace panel new session targets the selected project", async ({ page }) => {
  await setup(page)

  const newSessionButton = page.locator('[data-action="workspace-panel-new-session"]')
  await expectAppVisible(newSessionButton)

  const openRow = page.locator(`[data-action="workspace-file-panel-project"][data-worktree="${openProject}"]`)
  const selectedRow = page.locator(`[data-action="workspace-file-panel-project"][data-worktree="${selectedProject}"]`)
  await expect(openRow).toBeVisible()
  await expect(selectedRow).toHaveAttribute("aria-current", "page")
  await expect(openRow).not.toHaveAttribute("aria-current", "page")

  await newSessionButton.click()
  await page.waitForURL(/\/new-session\?draftId=/)

  await expect.poll(() => draftDirectory(page)).toBe(selectedProject)
  await expect(selectedRow).toHaveAttribute("aria-current", "page")
})

test("titlebar new session follows the selected project while a different session is active", async ({ page }) => {
  await setup(page)

  const titlebarButton = page.locator('[data-action="titlebar-new-session"]')
  await expectAppVisible(titlebarButton)

  const selectedRow = page.locator(`[data-action="workspace-file-panel-project"][data-worktree="${selectedProject}"]`)
  await expect(selectedRow).toHaveAttribute("aria-current", "page")

  await titlebarButton.click()
  await page.waitForURL(/\/new-session\?draftId=/)

  await expect.poll(() => draftDirectory(page)).toBe(selectedProject)
})

test("workspace panel new project button registers the picked directory as a project", async ({ page }) => {
  await setup(page)

  const newProjectButton = page.locator('[data-action="workspace-panel-new-project"]')
  await expectAppVisible(newProjectButton)
  await expect(newProjectButton).toContainText("新建项目")

  await newProjectButton.click()

  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByRole("textbox").fill("brandnew")

  const pickedRow = page.locator(`[data-directory-path="${pickedSelector}"]`)
  await expect(pickedRow).toBeVisible()
  await pickedRow.click()

  const projectRow = page.locator(`[data-action="workspace-file-panel-project"][data-worktree="${pickedSelector}"]`)
  await expect(projectRow).toBeVisible()
  await expect(projectRow).toHaveAttribute("aria-current", "page")

  const titlebarButton = page.locator('[data-action="titlebar-new-session"]')
  await titlebarButton.click()
  await page.waitForURL(/\/new-session\?draftId=/)

  await expect.poll(() => draftDirectory(page)).toBe(pickedDirectory)
})
