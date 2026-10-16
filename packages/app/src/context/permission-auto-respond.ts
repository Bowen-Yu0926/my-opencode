import { base64Decode, base64Encode } from "@opencode-ai/core/util/encode"
import { pathKey } from "@/utils/path-key"

/** Normalize directory paths so Windows `\` / `/` variants share one auto-accept key. */
export function acceptDirectoryKey(directory: string) {
  return pathKey(directory)
}

export function acceptKey(sessionID: string, directory?: string) {
  if (!directory) return sessionID
  return `${base64Encode(acceptDirectoryKey(directory))}/${sessionID}`
}

export function directoryAcceptKey(directory: string) {
  return `${base64Encode(acceptDirectoryKey(directory))}/*`
}

/** Prefix for all keys scoped to a directory (`base64(dir)/…`). */
export function directoryAcceptPrefix(directory: string) {
  return `${base64Encode(acceptDirectoryKey(directory))}/`
}

function accepted(autoAccept: Record<string, boolean>, sessionID: string, directory?: string) {
  const key = acceptKey(sessionID, directory)
  return autoAccept[key] ?? autoAccept[sessionID]
}

export function isDirectoryAutoAccepting(autoAccept: Record<string, boolean>, directory: string) {
  const key = directoryAcceptKey(directory)
  return autoAccept[key] ?? false
}

/**
 * Rewrite persisted auto-accept keys so directories use pathKey (slash-normalized).
 * Legacy keys without a directory segment (bare session IDs) are left as-is.
 */
export function normalizeAutoAcceptKeys(autoAccept: Record<string, boolean>) {
  const next: Record<string, boolean> = {}
  for (const [key, value] of Object.entries(autoAccept)) {
    const slash = key.indexOf("/")
    if (slash === -1) {
      next[key] = value
      continue
    }

    const encoded = key.slice(0, slash)
    const suffix = key.slice(slash + 1)
    try {
      const decoded = base64Decode(encoded)
      const normalized = `${base64Encode(acceptDirectoryKey(decoded))}/${suffix}`
      // Prefer already-normalized / later entries if both exist.
      if (normalized in next && key !== normalized) continue
      next[normalized] = value
    } catch {
      next[key] = value
    }
  }
  return next
}

/** Drop session-scoped overrides under a directory (keeps the `…/*` directory key). */
export function clearDirectorySessionOverrides(autoAccept: Record<string, boolean>, directory: string) {
  const prefix = directoryAcceptPrefix(directory)
  const directoryKey = directoryAcceptKey(directory)
  for (const key of Object.keys(autoAccept)) {
    if (key === directoryKey) continue
    if (key.startsWith(prefix)) delete autoAccept[key]
  }
}

function sessionLineage(session: { id: string; parentID?: string }[], sessionID: string) {
  const parent = session.reduce((acc, item) => {
    if (item.parentID) acc.set(item.id, item.parentID)
    return acc
  }, new Map<string, string>())
  const seen = new Set([sessionID])
  const ids = [sessionID]

  for (const id of ids) {
    const parentID = parent.get(id)
    if (!parentID || seen.has(parentID)) continue
    seen.add(parentID)
    ids.push(parentID)
  }

  return ids
}

export function autoRespondsPermission(
  autoAccept: Record<string, boolean>,
  session: { id: string; parentID?: string }[],
  permission: { sessionID: string },
  directory?: string,
) {
  const value = sessionAutoAccept(autoAccept, session, permission, directory)
  if (value !== undefined) return value
  return directory ? isDirectoryAutoAccepting(autoAccept, directory) : false
}

export function sessionAutoAccept(
  autoAccept: Record<string, boolean>,
  session: { id: string; parentID?: string }[],
  permission: { sessionID: string },
  directory?: string,
) {
  return sessionLineage(session, permission.sessionID)
    .map((id) => accepted(autoAccept, id, directory))
    .find((item): item is boolean => item !== undefined)
}
