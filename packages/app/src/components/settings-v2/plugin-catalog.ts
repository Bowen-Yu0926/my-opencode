export type PluginLocale = "en" | "zh"

export type PluginCatalogEntry = {
  id: string
  description: Record<PluginLocale, string>
}

/** Curated plugins shown as installable cards, with short purpose blurbs. */
export const PLUGIN_CATALOG: PluginCatalogEntry[] = [
  {
    id: "opencode-wakatime",
    description: {
      en: "Track AI coding activity and time spent with WakaTime.",
      zh: "用 WakaTime 追踪 AI 编码活动与用时。",
    },
  },
  {
    id: "oh-my-opencode",
    description: {
      en: "Background agents, LSP/AST/MCP tools, and Claude Code–compatible workflows.",
      zh: "后台智能体、LSP/AST/MCP 工具，以及兼容 Claude Code 的工作流。",
    },
  },
  {
    id: "opencode-notifier",
    description: {
      en: "Desktop notifications and sounds for permissions, completion, and errors.",
      zh: "权限请求、完成与错误时发出桌面通知与提示音。",
    },
  },
  {
    id: "opencode-notify",
    description: {
      en: "Native OS notifications when OpenCode tasks finish.",
      zh: "任务完成时发送系统原生通知。",
    },
  },
  {
    id: "opencode-dynamic-context-pruning",
    description: {
      en: "Prune obsolete tool outputs to reduce token usage.",
      zh: "清理过时的工具输出，降低上下文 token 占用。",
    },
  },
  {
    id: "opencode-supermemory",
    description: {
      en: "Persistent memory across sessions via Supermemory.",
      zh: "通过 Supermemory 在会话间保留长期记忆。",
    },
  },
  {
    id: "opencode-pty",
    description: {
      en: "Run background processes in a PTY and send interactive input.",
      zh: "在 PTY 中运行后台进程，并向其发送交互输入。",
    },
  },
  {
    id: "opencode-websearch-cited",
    description: {
      en: "Native web search with cited, Google-grounded style results.",
      zh: "内置网页搜索，并附带可引用的检索结果。",
    },
  },
  {
    id: "opencode-firecrawl",
    description: {
      en: "Scrape, crawl, and search the web via Firecrawl.",
      zh: "通过 Firecrawl 抓取、爬取与搜索网页。",
    },
  },
  {
    id: "opencode-tavily",
    description: {
      en: "Web search, extraction, crawling, and deep research via Tavily.",
      zh: "通过 Tavily 进行网页搜索、抽取、爬取与深度调研。",
    },
  },
  {
    id: "opencode-worktree",
    description: {
      en: "Zero-friction git worktrees for parallel OpenCode sessions.",
      zh: "轻松管理 git worktree，便于并行会话。",
    },
  },
  {
    id: "opencode-openai-codex-auth",
    description: {
      en: "Use your ChatGPT Plus/Pro plan instead of API credits.",
      zh: "使用 ChatGPT Plus/Pro 订阅，而不是按 API 计费。",
    },
  },
  {
    id: "opencode-gemini-auth",
    description: {
      en: "Use your existing Gemini plan instead of API billing.",
      zh: "使用已有的 Gemini 套餐，而不是按 API 计费。",
    },
  },
  {
    id: "opencode-vibeguard",
    description: {
      en: "Redact secrets/PII before LLM calls and restore them locally.",
      zh: "调用模型前脱敏密钥与隐私信息，本地再还原。",
    },
  },
  {
    id: "opencode-md-table-formatter",
    description: {
      en: "Clean up markdown tables produced by LLMs.",
      zh: "整理模型生成的 Markdown 表格格式。",
    },
  },
  {
    id: "opencode-shell-strategy",
    description: {
      en: "Prefer non-interactive shell commands to avoid TTY hangs.",
      zh: "优先使用非交互 shell 命令，避免卡在终端交互。",
    },
  },
  {
    id: "opencode-type-inject",
    description: {
      en: "Auto-inject TypeScript/Svelte types into file reads.",
      zh: "读取文件时自动注入 TypeScript/Svelte 类型信息。",
    },
  },
  {
    id: "opencode-helicone-session",
    description: {
      en: "Inject Helicone session headers for request grouping.",
      zh: "自动注入 Helicone 会话头，便于请求分组统计。",
    },
  },
]

const byId = new Map(PLUGIN_CATALOG.map((entry) => [entry.id, entry]))

/** Strip version / path noise so catalog and npm lookups use the package id. */
export function pluginPackageId(spec: string): string {
  const value = spec.trim()
  if (!value) return value
  if (value.startsWith("file:") || value.startsWith(".") || value.startsWith("/") || value.includes("\\")) {
    return value
  }
  const matched = value.match(/^(@[^/]+\/[^@]+|[^@]+)(?:@.+)?$/)
  return matched?.[1] ?? value
}

/** Auto-discovered / path plugins are built-in to OpenCode load paths — hide from the manager UI. */
export function isManagedNpmPlugin(spec: string): boolean {
  const value = spec.trim()
  if (!value) return false
  if (value.startsWith("file:")) return false
  if (value.startsWith(".") || value.startsWith("/") || value.includes("\\")) return false
  if (/^[A-Za-z]:[\\/]/.test(value)) return false
  return true
}

export function catalogEntry(id: string): PluginCatalogEntry | undefined {
  return byId.get(pluginPackageId(id))
}

export function catalogDescription(id: string, locale: PluginLocale): string | undefined {
  return catalogEntry(id)?.description[locale] ?? catalogEntry(id)?.description.en
}

const npmCache = new Map<string, string | null>()

export async function fetchNpmDescription(id: string, signal?: AbortSignal): Promise<string | undefined> {
  const name = pluginPackageId(id)
  if (!name || name.startsWith("file:") || name.startsWith(".") || name.startsWith("/") || name.includes("\\")) {
    return
  }
  if (npmCache.has(name)) {
    const hit = npmCache.get(name)
    return hit ?? undefined
  }
  try {
    const path = name.startsWith("@") ? name.replace("/", "%2F") : encodeURIComponent(name)
    const response = await fetch(`https://registry.npmjs.org/${path}`, {
      signal,
      headers: { Accept: "application/json" },
    })
    if (!response.ok) {
      npmCache.set(name, null)
      return
    }
    const data = (await response.json()) as { description?: unknown }
    const description = typeof data.description === "string" ? data.description.trim() : ""
    npmCache.set(name, description || null)
    return description || undefined
  } catch {
    if (signal?.aborted) return
    npmCache.set(name, null)
    return
  }
}
