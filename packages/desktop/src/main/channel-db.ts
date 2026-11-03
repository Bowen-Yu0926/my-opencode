/** Map desktop userData appId folders to channel-isolated sqlite filenames. */
export function channelDatabaseName(userDataPath: string) {
  const base = userDataPath.replaceAll("\\", "/").toLowerCase()
  if (base.endsWith("/ai.opencode.desktop.dev") || base === "ai.opencode.desktop.dev") return "opencode-dev.db"
  if (base.endsWith("/ai.opencode.desktop.beta") || base === "ai.opencode.desktop.beta") return "opencode-beta.db"
  return undefined
}

export function applyChannelDatabaseEnv(env: { OPENCODE_DB?: string }, userDataPath: string) {
  if (env.OPENCODE_DB) return
  const name = channelDatabaseName(userDataPath)
  if (name) env.OPENCODE_DB = name
}
