import { describe, expect, test } from "bun:test"
import { applyChannelDatabaseEnv, channelDatabaseName } from "./channel-db"

describe("channelDatabaseName", () => {
  test("uses channel-specific databases for desktop appId folders", () => {
    expect(channelDatabaseName("C:\\Users\\me\\AppData\\Roaming\\ai.opencode.desktop.dev")).toBe("opencode-dev.db")
    expect(channelDatabaseName("/home/me/.config/ai.opencode.desktop.beta")).toBe("opencode-beta.db")
    expect(channelDatabaseName("C:\\Users\\me\\AppData\\Roaming\\ai.opencode.desktop")).toBeUndefined()
  })

  test("does not override an explicit OPENCODE_DB", () => {
    const env = { OPENCODE_DB: "custom.db" }
    applyChannelDatabaseEnv(env, "C:\\Users\\me\\AppData\\Roaming\\ai.opencode.desktop.dev")
    expect(env.OPENCODE_DB).toBe("custom.db")
  })

  test("sets OPENCODE_DB for the desktop.dev app folder", () => {
    const env: { OPENCODE_DB?: string } = {}
    applyChannelDatabaseEnv(env, "C:\\Users\\me\\AppData\\Roaming\\ai.opencode.desktop.dev")
    expect(env.OPENCODE_DB).toBe("opencode-dev.db")
  })
})
