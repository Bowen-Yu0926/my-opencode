export type PathKey = string & { _brand: "PathKey" }

const isDrive = (value: string) => {
  if (value.length !== 2) return false
  const code = value.charCodeAt(0)
  return value[1] === ":" && ((code >= 65 && code <= 90) || (code >= 97 && code <= 122))
}

const trimTrailingSlashes = (value: string) => {
  for (let i = value.length - 1; i >= 0; i--) {
    if (value[i] !== "/") return value.slice(0, i + 1)
  }
  return ""
}

const isWindowsPath = (value: string) => value[1] === ":" || value.startsWith("\\\\")

const caseInsensitiveFs = (path: string) => {
  // In Node (CLI/tests) the platform is authoritative; on Linux a Windows-shaped
  // path must keep its case, so platform wins over the path-shape heuristic.
  if (typeof process !== "undefined" && typeof process.platform === "string") {
    return process.platform === "win32" || process.platform === "darwin"
  }
  // Renderer has no Node `process`; fall back to path shape / navigator.
  if (isWindowsPath(path)) return true
  if (typeof navigator !== "undefined") {
    const platform = navigator.platform || navigator.userAgent || ""
    return /Win/i.test(platform) || /Mac/i.test(platform)
  }
  return false
}

export const pathKey = (path: string) => {
  const value = isWindowsPath(path) ? path.replaceAll("\\", "/") : path
  // Windows and macOS filesystems are case-insensitive, so normalize to lowercase
  // to avoid splitting the same directory into distinct keys (e.g. `C:/Repo` vs `c:/repo`).
  const normalized = caseInsensitiveFs(path) ? value.toLowerCase() : value
  const trimmed = trimTrailingSlashes(normalized)
  if (!trimmed && normalized.startsWith("/")) return "/" as PathKey
  if (isDrive(trimmed)) return `${trimmed}/` as PathKey
  return trimmed as PathKey
}
