import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { showToast } from "@/utils/toast"
import { createMemo, createResource, createSignal, type Component, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSync } from "@/context/server-sync"
import {
  catalogDescription,
  fetchNpmDescription,
  isManagedNpmPlugin,
  pluginPackageId,
  type PluginLocale,
} from "./plugin-catalog"
import "./settings-v2.css"

type PluginSpec = string | [string, ...unknown[]]

function pluginId(spec: PluginSpec): string {
  return Array.isArray(spec) ? spec[0] : spec
}

function normalizeSpecs(value: unknown): PluginSpec[] {
  if (!Array.isArray(value)) return []
  const next: PluginSpec[] = []
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      next.push(item.trim())
      continue
    }
    if (Array.isArray(item) && typeof item[0] === "string" && item[0].trim()) {
      next.push(item as PluginSpec)
    }
  }
  return next
}

function normalizeDisabled(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map(pluginPackageId)
}

function displayName(id: string): string {
  const name = pluginPackageId(id)
  if (name.startsWith("@")) {
    const parts = name.split("/")
    return parts[1] || name
  }
  return name
}

export const SettingsPluginsV2: Component = () => {
  const language = useLanguage()
  const serverSync = useServerSync()
  const [draft, setDraft] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  const locale = createMemo<PluginLocale>(() => (language.locale() === "zh" ? "zh" : "en"))

  const specs = createMemo(() => normalizeSpecs(serverSync().data.config.plugin))
  const disabledList = createMemo(() => normalizeDisabled(serverSync().data.config.disabled_plugins))
  const disabledSet = createMemo(() => new Set(disabledList()))
  const managedSpecs = createMemo(() => specs().filter((spec) => isManagedNpmPlugin(pluginId(spec))))
  const installedIds = createMemo(() => managedSpecs().map((spec) => pluginPackageId(pluginId(spec))))
  const installedSet = createMemo(() => new Set(installedIds()))

  const installed = createMemo(() =>
    managedSpecs().map((spec) => {
      const id = pluginPackageId(pluginId(spec))
      return {
        id,
        title: displayName(id),
        description: catalogDescription(id, locale()),
        enabled: !disabledSet().has(id),
      }
    }),
  )

  const unknownIds = createMemo(() =>
    installed()
      .filter((item) => !item.description)
      .map((item) => item.id)
      .sort()
      .join("\0"),
  )

  const [npmDescriptions] = createResource(unknownIds, async (key) => {
    if (!key) return {} as Record<string, string>
    const ids = key.split("\0").filter(Boolean)
    const controller = new AbortController()
    const entries = await Promise.all(
      ids.map(async (id) => {
        const description = await fetchNpmDescription(id, controller.signal)
        return [id, description] as const
      }),
    )
    return Object.fromEntries(entries.filter((entry): entry is [string, string] => !!entry[1]))
  })

  const descriptionFor = (id: string, fallback?: string) =>
    fallback ?? npmDescriptions()?.[id] ?? language.t("settings.plugins.card.unknownDescription")

  const persist = async (
    patch: { plugin?: PluginSpec[]; disabled_plugins?: string[] },
    success: { title: string; description: string },
  ) => {
    const beforePlugin = specs()
    const beforeDisabled = disabledList()
    if (patch.plugin) serverSync().set("config", "plugin", patch.plugin)
    if (patch.disabled_plugins) serverSync().set("config", "disabled_plugins", patch.disabled_plugins)
    setBusy(true)
    try {
      await serverSync().updateConfig({
        ...(patch.plugin ? { plugin: patch.plugin as string[] } : {}),
        ...(patch.disabled_plugins ? { disabled_plugins: patch.disabled_plugins } : {}),
      })
      showToast({
        variant: "success",
        icon: "circle-check",
        title: success.title,
        description: success.description,
      })
      return true
    } catch (err: unknown) {
      serverSync().set("config", "plugin", beforePlugin)
      serverSync().set("config", "disabled_plugins", beforeDisabled)
      await serverSync().refreshBootstrap().catch(() => undefined)
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
      return false
    } finally {
      setBusy(false)
    }
  }

  const hasSpec = (name: string) =>
    specs().some((spec) => pluginPackageId(pluginId(spec)) === pluginPackageId(name))

  const add = async (raw?: string) => {
    if (busy()) return
    const name = (raw ?? draft()).trim()
    if (!name) {
      showToast({
        title: language.t("settings.plugins.toast.nameRequired.title"),
        description: language.t("settings.plugins.toast.nameRequired.description"),
      })
      return
    }
    const id = pluginPackageId(name)
    if (installedSet().has(id) || hasSpec(name)) {
      showToast({
        title: language.t("settings.plugins.toast.alreadyInstalled.title"),
        description: language.t("settings.plugins.toast.alreadyInstalled.description", { plugin: id }),
      })
      return
    }
    const ok = await persist(
      {
        plugin: [...specs(), name],
        disabled_plugins: disabledList().filter((item) => item !== id),
      },
      {
        title: language.t("settings.plugins.toast.added.title", { plugin: id }),
        description: language.t("settings.plugins.toast.added.description", { plugin: id }),
      },
    )
    if (ok && !raw) setDraft("")
  }

  const remove = async (id: string) => {
    if (busy()) return
    await persist(
      {
        plugin: specs().filter((spec) => pluginPackageId(pluginId(spec)) !== id),
        disabled_plugins: disabledList().filter((item) => item !== id),
      },
      {
        title: language.t("settings.plugins.toast.removed.title", { plugin: id }),
        description: language.t("settings.plugins.toast.removed.description", { plugin: id }),
      },
    )
  }

  const setEnabled = async (id: string, enabled: boolean) => {
    if (busy()) return
    if (enabled === !disabledSet().has(id)) return
    const next = enabled ? disabledList().filter((item) => item !== id) : [...disabledList(), id]
    await persist(
      { disabled_plugins: next },
      {
        title: enabled
          ? language.t("settings.plugins.toast.enabled.title", { plugin: id })
          : language.t("settings.plugins.toast.disabled.title", { plugin: id }),
        description: enabled
          ? language.t("settings.plugins.toast.enabled.description", { plugin: id })
          : language.t("settings.plugins.toast.disabled.description", { plugin: id }),
      },
    )
  }

  return (
    <>
      <div class="settings-v2-tab-header settings-v2-tab-header--plugins">
        <h2 class="settings-v2-tab-title">{language.t("settings.plugins.title")}</h2>
        <p class="settings-v2-tab-description">{language.t("settings.plugins.description")}</p>
      </div>

      <div class="settings-v2-tab-body settings-v2-plugins">
        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.plugins.section.installed")}</h3>
          <Show
            when={installed().length > 0}
            fallback={<div class="settings-v2-provider-empty">{language.t("settings.plugins.installed.empty")}</div>}
          >
            <div class="settings-v2-plugin-grid">
              <For each={installed()}>
                {(item) => (
                  <article
                    class="settings-v2-plugin-card"
                    data-installed=""
                    data-disabled={item.enabled ? undefined : ""}
                  >
                    <div class="settings-v2-plugin-card-top">
                      <div class="settings-v2-plugin-card-heading">
                        <h4 class="settings-v2-plugin-card-title" title={item.id}>
                          {item.title}
                        </h4>
                        <Tag>
                          {item.enabled
                            ? language.t("settings.plugins.tag.enabled")
                            : language.t("settings.plugins.tag.disabled")}
                        </Tag>
                      </div>
                      <p class="settings-v2-plugin-card-id truncate" title={item.id}>
                        {item.id}
                      </p>
                    </div>
                    <p class="settings-v2-plugin-card-description">{descriptionFor(item.id, item.description)}</p>
                    <div class="settings-v2-plugin-card-actions">
                      <div class="settings-v2-plugin-card-toggle">
                        <Switch
                          checked={item.enabled}
                          disabled={busy()}
                          hideLabel
                          onChange={(checked) => void setEnabled(item.id, checked)}
                        >
                          {language.t("settings.plugins.toggle.label")}
                        </Switch>
                        <span class="settings-v2-plugin-card-toggle-label">
                          {item.enabled
                            ? language.t("settings.plugins.toggle.on")
                            : language.t("settings.plugins.toggle.off")}
                        </span>
                      </div>
                      <ButtonV2
                        size="normal"
                        variant="ghost-muted"
                        disabled={busy()}
                        onClick={() => void remove(item.id)}
                      >
                        {language.t("common.delete")}
                      </ButtonV2>
                    </div>
                  </article>
                )}
              </For>
            </div>
          </Show>
        </div>

        <div class="settings-v2-section">
          <h3 class="settings-v2-section-title">{language.t("settings.plugins.section.add")}</h3>
          <div class="settings-v2-plugin-add-row">
            <TextInputV2
              appearance="base"
              class="!w-full"
              value={draft()}
              disabled={busy()}
              placeholder={language.t("settings.plugins.add.placeholder")}
              spellcheck={false}
              autocorrect="off"
              onInput={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void add()
                }
              }}
            />
            <ButtonV2 size="normal" variant="neutral" icon="plus" disabled={busy()} onClick={() => void add()}>
              {language.t("settings.plugins.add.action")}
            </ButtonV2>
          </div>
          <p class="settings-v2-provider-description settings-v2-plugin-add-hint">
            {language.t("settings.plugins.add.hint")}
          </p>
        </div>
      </div>
    </>
  )
}
