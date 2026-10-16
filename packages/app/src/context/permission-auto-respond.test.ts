import { describe, expect, test } from "bun:test"
import type { PermissionRequest, Session } from "@opencode-ai/sdk/v2/client"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { pathKey } from "@/utils/path-key"
import {
  acceptKey,
  autoRespondsPermission,
  clearDirectorySessionOverrides,
  directoryAcceptKey,
  isDirectoryAutoAccepting,
  normalizeAutoAcceptKeys,
  sessionAutoAccept,
} from "./permission-auto-respond"

const session = (input: { id: string; parentID?: string }) =>
  ({
    id: input.id,
    parentID: input.parentID,
  }) as Session

const permission = (sessionID: string) =>
  ({
    sessionID,
  }) as Pick<PermissionRequest, "sessionID">

describe("autoRespondsPermission", () => {
  test("uses a parent session's directory-scoped auto-accept", () => {
    const directory = "/tmp/project"
    const sessions = [session({ id: "root" }), session({ id: "child", parentID: "root" })]
    const autoAccept = {
      [`${base64Encode(directory)}/root`]: true,
    }

    expect(autoRespondsPermission(autoAccept, sessions, permission("child"), directory)).toBe(true)
  })

  test("uses a parent session's legacy auto-accept key", () => {
    const sessions = [session({ id: "root" }), session({ id: "child", parentID: "root" })]

    expect(autoRespondsPermission({ root: true }, sessions, permission("child"), "/tmp/project")).toBe(true)
  })

  test("defaults to requiring approval when no lineage override exists", () => {
    const sessions = [session({ id: "root" }), session({ id: "child", parentID: "root" }), session({ id: "other" })]
    const autoAccept = {
      other: true,
    }

    expect(autoRespondsPermission(autoAccept, sessions, permission("child"), "/tmp/project")).toBe(false)
  })

  test("inherits a parent session's false override", () => {
    const directory = "/tmp/project"
    const sessions = [session({ id: "root" }), session({ id: "child", parentID: "root" })]
    const autoAccept = {
      [`${base64Encode(directory)}/root`]: false,
    }

    expect(autoRespondsPermission(autoAccept, sessions, permission("child"), directory)).toBe(false)
  })

  test("prefers a child override over parent override", () => {
    const directory = "/tmp/project"
    const sessions = [session({ id: "root" }), session({ id: "child", parentID: "root" })]
    const autoAccept = {
      [`${base64Encode(directory)}/root`]: false,
      [`${base64Encode(directory)}/child`]: true,
    }

    expect(autoRespondsPermission(autoAccept, sessions, permission("child"), directory)).toBe(true)
  })

  test("falls back to directory-level auto-accept", () => {
    const directory = "/tmp/project"
    const sessions = [session({ id: "root" })]
    const autoAccept = {
      [`${base64Encode(directory)}/*`]: true,
    }

    expect(autoRespondsPermission(autoAccept, sessions, permission("root"), directory)).toBe(true)
    expect(sessionAutoAccept(autoAccept, sessions, permission("root"), directory)).toBeUndefined()
  })

  test("session-level override takes precedence over directory-level", () => {
    const directory = "/tmp/project"
    const sessions = [session({ id: "root" })]
    const autoAccept = {
      [`${base64Encode(directory)}/*`]: true,
      [`${base64Encode(directory)}/root`]: false,
    }

    expect(autoRespondsPermission(autoAccept, sessions, permission("root"), directory)).toBe(false)
  })

  test("parent false override takes precedence over directory-level auto-accept", () => {
    const directory = "/tmp/project"
    const sessions = [session({ id: "root" }), session({ id: "child", parentID: "root" })]
    const autoAccept = {
      [`${base64Encode(directory)}/*`]: true,
      [`${base64Encode(directory)}/root`]: false,
    }

    expect(autoRespondsPermission(autoAccept, sessions, permission("child"), directory)).toBe(false)
  })

  test("parent true override takes precedence over disabled directory fallback", () => {
    const directory = "/tmp/project"
    const sessions = [session({ id: "root" }), session({ id: "child", parentID: "root" })]
    const autoAccept = {
      [`${base64Encode(directory)}/*`]: false,
      [`${base64Encode(directory)}/root`]: true,
    }

    expect(autoRespondsPermission(autoAccept, sessions, permission("child"), directory)).toBe(true)
  })
})

describe("isDirectoryAutoAccepting", () => {
  test("returns true when directory key is set", () => {
    const directory = "/tmp/project"
    const autoAccept = { [`${base64Encode(directory)}/*`]: true }
    expect(isDirectoryAutoAccepting(autoAccept, directory)).toBe(true)
  })

  test("returns false when directory key is not set", () => {
    expect(isDirectoryAutoAccepting({}, "/tmp/project")).toBe(false)
  })

  test("returns false when directory key is explicitly false", () => {
    const directory = "/tmp/project"
    const autoAccept = { [`${base64Encode(directory)}/*`]: false }
    expect(isDirectoryAutoAccepting(autoAccept, directory)).toBe(false)
  })

  test("matches Windows path slash variants for directory-level accept", () => {
    const stored = "E:\\openCode\\opencode"
    const event = "E:/openCode/opencode"
    const autoAccept = { [directoryAcceptKey(stored)]: true }

    expect(isDirectoryAutoAccepting(autoAccept, event)).toBe(true)
    expect(autoRespondsPermission(autoAccept, [session({ id: "root" })], permission("root"), event)).toBe(true)
  })

  test("matches Windows path slash variants for session-level accept", () => {
    const stored = "E:\\openCode\\opencode"
    const event = "E:/openCode/opencode"
    const autoAccept = { [acceptKey("root", stored)]: true }

    expect(autoRespondsPermission(autoAccept, [session({ id: "root" })], permission("root"), event)).toBe(true)
  })
})

describe("normalizeAutoAcceptKeys", () => {
  test("rewrites backslash directory keys to pathKey form", () => {
    const legacy = "E:\\openCode\\opencode"
    const normalized = pathKey(legacy)
    const input = {
      [`${base64Encode(legacy)}/*`]: true,
      [`${base64Encode(legacy)}/ses_1`]: false,
      bare: true,
    }

    expect(normalizeAutoAcceptKeys(input)).toEqual({
      [`${base64Encode(normalized)}/*`]: true,
      [`${base64Encode(normalized)}/ses_1`]: false,
      bare: true,
    })
  })
})

describe("clearDirectorySessionOverrides", () => {
  test("removes session keys under the directory but keeps the directory key", () => {
    const directory = "/tmp/project"
    const autoAccept = {
      [directoryAcceptKey(directory)]: true,
      [acceptKey("a", directory)]: false,
      [acceptKey("b", directory)]: true,
      other: true,
    }

    clearDirectorySessionOverrides(autoAccept, directory)

    expect(autoAccept).toEqual({
      [directoryAcceptKey(directory)]: true,
      other: true,
    })
  })
})
