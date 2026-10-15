import { describe, expect, test } from "bun:test"

describe("relaunch args", () => {
  test("keeps electron switches and forces the app path", () => {
    const home = "C:\\Users\\18141"
    const appPath = "E:\\myopencode\\packages\\desktop"
    const argv = ["electron.exe", "--inspect", home, ".", appPath, "extra"]
    const switches = argv.slice(1).filter((arg) => arg.startsWith("--") || arg.startsWith("-"))
    const args = [...switches, appPath].filter((arg) => arg !== "." && arg !== home)
    expect(args).toEqual(["--inspect", appPath])
  })
})
