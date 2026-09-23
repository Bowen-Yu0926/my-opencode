import { readFileSync } from "node:fs"

declare global {
  const OPENCODE_VERSION: string
  const OPENCODE_CHANNEL: string
}

function packageVersion(): string {
  try {
    return JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf-8")).version ?? "local"
  } catch {
    return "local"
  }
}

export const InstallationVersion = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : packageVersion()
export const InstallationChannel = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
