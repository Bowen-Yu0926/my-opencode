import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { installSseTransport } from "../utils/sse-transport"
import { expectSessionTitle } from "../utils/waits"

const directory = "C:/OpenCode/RequestDocks"
const projectID = "proj_request_docks"
const sessionID = "ses_request_docks"
const title = "Request dock regression"

test("shows a pending question dock", async ({ page }) => {
  await mockServer(page, {
    questions: [
      {
        id: "question-request",
        sessionID,
        questions: [
          {
            header: "Implementation",
            question: "Which implementation should be used?",
            options: [
              { label: "Minimal", description: "Use the smallest correct change" },
              { label: "Extended", description: "Include additional behavior" },
            ],
          },
        ],
      },
    ],
  })

  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  await expectSessionTitle(page, title)

  const editor = page.locator('[data-component="prompt-input"][contenteditable="true"]')
  const composer = page.locator('[data-component="prompt-input-v2"]')
  await expect(editor).toBeVisible()
  await expect(composer).toHaveAttribute("data-answer-pending", "true")
  await expect(editor.locator("xpath=following-sibling::div[1]")).toHaveText("输入你的答案...")

  const reply = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === `/api/session/${sessionID}/question/question-request/reply`,
  )
  await editor.fill("Minimal")
  await editor.press("Enter")
  expect((await reply).postDataJSON()).toEqual({ answers: [["Minimal"]] })
})

test("shows a pending permission dock", async ({ page }) => {
  await mockServer(page, {
    permissions: [
      {
        id: "permission-request",
        sessionID,
        permission: "bash",
        patterns: ["git status", "git diff"],
        metadata: {},
        always: [],
      },
    ],
  })

  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  await expectSessionTitle(page, title)

  const permission = page.locator('[data-component="dock-prompt"][data-kind="permission"]')
  await expect(permission).toBeVisible()
  await expect(permission.getByText("git status")).toBeVisible()
  await expect(permission.getByText("git diff")).toBeVisible()
  await expect(permission.locator('[data-slot="permission-footer-actions"] button')).toHaveCount(3)
  await expect(page.locator('[data-component="session-composer"]')).toHaveCount(0)

  const reply = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === `/api/session/${sessionID}/permission/permission-request/reply`,
  )
  await permission.locator('[data-slot="permission-footer-actions"] button[data-variant="primary"]').click()
  expect((await reply).postDataJSON()).toEqual({ reply: "once" })
})

test("enables allow-all from the permission dock", async ({ page }) => {
  await mockServer(page, {
    permissions: [
      {
        id: "permission-request",
        sessionID,
        permission: "bash",
        patterns: ["git status"],
        metadata: {},
        always: [],
      },
    ],
  })

  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  await expectSessionTitle(page, title)

  const permission = page.locator('[data-component="dock-prompt"][data-kind="permission"]')
  await expect(permission).toBeVisible()

  const reply = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).pathname === `/api/session/${sessionID}/permission/permission-request/reply`,
  )
  await permission.locator('[data-slot="checkbox-checkbox-control"]').click()
  expect((await reply).postDataJSON()).toEqual({ reply: "once" })
  await expect(permission).toHaveCount(0)
})

test("keeps the draft caret when a question arrives and is rejected", async ({ page }) => {
  const transport = await installSseTransport(page, {
    server: `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`,
    retry: 20,
  })
  await mockServer(page, { questions: [] })
  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  await transport.waitForConnection()
  await expectSessionTitle(page, title)

  const editor = page.locator('[data-component="prompt-input"][contenteditable="true"]')
  const composer = page.locator('[data-component="prompt-input-v2"]')
  const draft = "keep the caret at the end"
  await editor.fill(draft)
  for (let index = 0; index < 4; index++) await page.keyboard.press("ArrowLeft")
  const cursor = draft.length - 4
  await expect
    .poll(() =>
      editor.evaluate((element) => {
        const selection = window.getSelection()
        if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return -1
        const range = selection.getRangeAt(0).cloneRange()
        range.selectNodeContents(element)
        range.setEnd(selection.anchorNode!, selection.anchorOffset)
        return range.toString().length
      }),
    )
    .toBe(cursor)
  await transport.send({
    directory,
    payload: {
      type: "question.asked",
      properties: {
        id: "question-caret",
        sessionID,
        questions: [
          {
            header: "Continue",
            question: "Continue?",
            options: [{ label: "Yes", description: "Continue the session" }],
          },
        ],
        tool: { messageID: "message-caret", callID: "call-caret" },
      },
    },
  })
  await expect(composer).toHaveAttribute("data-answer-pending", "true")
  await expect
    .poll(() =>
      editor.evaluate((element) => {
        const selection = window.getSelection()
        if (!selection?.rangeCount || !element.contains(selection.anchorNode)) return -1
        const range = selection.getRangeAt(0).cloneRange()
        range.selectNodeContents(element)
        range.setEnd(selection.anchorNode!, selection.anchorOffset)
        return range.toString().length
      }),
    )
    .toBe(cursor)

  await transport.send({
    directory,
    payload: { type: "question.rejected", properties: { sessionID, requestID: "question-caret" } },
  })
  await expect(composer).toHaveAttribute("data-answer-pending", "false")
  await page.keyboard.press("x")

  await expect(editor).toHaveText(`${draft.slice(0, cursor)}x${draft.slice(cursor)}`)
})

async function mockServer(
  page: Page,
  requests: {
    permissions?: unknown[] | (() => unknown[])
    questions?: unknown[] | (() => unknown[])
  },
) {
  await mockOpenCodeServer(page, {
    protocol: "v2",
    directory,
    project: {
      id: projectID,
      worktree: directory,
      vcs: "git",
      name: "request-docks",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: {
            "claude-opus-4-6": {
              id: "claude-opus-4-6",
              name: "Claude Opus 4.6",
              limit: { context: 200_000 },
            },
          },
        },
      ],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "claude-opus-4-6" },
    },
    sessions: [
      {
        id: sessionID,
        slug: "request-docks",
        projectID,
        directory,
        title,
        version: "dev",
        time: { created: 1700000000000, updated: 1700000000000 },
      },
    ],
    pageMessages: () => ({ items: [] }),
    permissions: requests.permissions,
    questions: requests.questions,
    fileList: () => [],
  })
  await page.addInitScript(() => {
    localStorage.setItem(
      "settings.v3",
      JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
    )
  })
}
