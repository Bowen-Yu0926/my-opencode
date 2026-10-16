import { describe, expect, test } from "bun:test"
import { DESKTOP_MENU } from "./desktop-menu"

describe("desktop menu", () => {
  test("keeps a slim personal-use menu without developer-only entries", () => {
    const ids = DESKTOP_MENU.map((menu) => menu.id)
    expect(ids).not.toContain("go")
    expect(ids).not.toContain("help")

    const items = DESKTOP_MENU.flatMap((menu) => menu.items ?? []).filter((item) => item.type === "item")
    expect(items.some((item) => item.labelKey === "desktop.menu.toggleDeveloperTools")).toBe(false)
    expect(items.some((item) => item.labelKey === "desktop.menu.exportLogs")).toBe(false)
    expect(items.some((item) => item.command === "session.new")).toBe(true)
    expect(items.some((item) => item.action === "app.checkForUpdates")).toBe(true)
  })

  test("provides translated labels for role-backed entries", () => {
    const windowMenu = DESKTOP_MENU.find((menu) => menu.role === "windowMenu")
    const roleItems = DESKTOP_MENU.flatMap((menu) => menu.items ?? []).filter(
      (item) => item.type === "item" && item.role && item.labelKey,
    )

    expect(windowMenu?.labelKey).toBe("desktop.menu.window")
    expect(roleItems.length).toBeGreaterThan(0)
  })
})
