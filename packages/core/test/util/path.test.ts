import { describe, expect, test } from "bun:test"
import { isWindowsReservedPath } from "../../src/util/path"

describe("isWindowsReservedPath", () => {
  test("ignores reserved names off Windows", () => {
    expect(isWindowsReservedPath("nul", "linux")).toBe(false)
    expect(isWindowsReservedPath("CON", "darwin")).toBe(false)
  })

  test("flags Windows reserved device names", () => {
    for (const name of ["nul", "NUL", "con", "PRN", "aux", "COM1", "lpt9", "nul.txt", "COM3.data"]) {
      expect(isWindowsReservedPath(name, "win32")).toBe(true)
    }
  })

  test("flags reserved names in nested relative paths", () => {
    expect(isWindowsReservedPath("tmp/nul", "win32")).toBe(true)
    expect(isWindowsReservedPath("src\\CON\\out.txt", "win32")).toBe(true)
  })

  test("allows ordinary paths", () => {
    for (const name of ["null.txt", "conduit.ts", "com10", "lpt10", "src/main.ts", "auxillary/index.js"]) {
      expect(isWindowsReservedPath(name, "win32")).toBe(false)
    }
  })
})
