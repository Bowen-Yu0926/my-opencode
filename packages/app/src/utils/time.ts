type TimeKey =
  | "common.time.justNow"
  | "common.time.minutesAgo.short"
  | "common.time.hoursAgo.short"
  | "common.time.daysAgo.short"
  | "common.time.minutesAgo.compact"
  | "common.time.hoursAgo.compact"
  | "common.time.daysAgo.compact"

type Translate = (key: TimeKey, params?: Record<string, string | number>) => string

function age(ms: number) {
  const diffMs = Math.max(0, Date.now() - ms)
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  return { diffSeconds, diffMinutes, diffHours, diffDays }
}

export function getRelativeTime(dateString: string, t: Translate): string {
  const { diffSeconds, diffMinutes, diffHours, diffDays } = age(new Date(dateString).getTime())
  if (diffSeconds < 60) return t("common.time.justNow")
  if (diffMinutes < 60) return t("common.time.minutesAgo.short", { count: diffMinutes })
  if (diffHours < 24) return t("common.time.hoursAgo.short", { count: diffHours })
  return t("common.time.daysAgo.short", { count: diffDays })
}

/** Ultra-short relative age for dense sidebars (e.g. `24m`, `6d`). */
export function getCompactRelativeTime(ms: number, t: Translate): string {
  const { diffSeconds, diffMinutes, diffHours, diffDays } = age(ms)
  if (diffSeconds < 60) return t("common.time.justNow")
  if (diffMinutes < 60) return t("common.time.minutesAgo.compact", { count: Math.max(1, diffMinutes) })
  if (diffHours < 24) return t("common.time.hoursAgo.compact", { count: Math.max(1, diffHours) })
  return t("common.time.daysAgo.compact", { count: Math.max(1, diffDays) })
}
