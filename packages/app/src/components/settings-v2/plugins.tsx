import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogV2, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode-ai/ui/v2/dialog-v2"
import { TextareaV2 } from "@opencode-ai/ui/v2/textarea-v2"
import { showToast } from "@/utils/toast"
import { createMemo, createResource, createSignal, type Accessor, type Component, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { SettingsListV2 } from "./parts/list"
import "./settings-v2.css"

type PluginSource = "file" | "npm"
type PluginScope = "global" | "local"

type PluginInfo = {
  spec: string
  name: string
  source: PluginSource
  scope: PluginScope
  description?: string
  descriptionOverridden?: boolean
}

const SOURCE_KEYS: Record<PluginSource, string> = {
  file: "settings.plugins.source.file",
  npm: "settings.plugins.source.npm",
}

const SCOPE_KEYS: Record<PluginScope, string> = {
  global: "settings.plugins.scope.global",
  local: "settings.plugins.scope.local",
}

const intro = (item: PluginInfo) => {
  const raw = item.description
  if (!raw) return undefined
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw
}

export const SettingsPluginsV2: Component<{ directory: Accessor<string | undefined> }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const serverSdk = useServerSDK()

  const [plugins, { refetch }] = createResource(
    () => ({ directory: props.directory() }),
    (input) => serverSdk().client.app.plugins({ directory: input.directory }),
  )

  const list = createMemo<PluginInfo[]>(() => plugins()?.data ?? [])

  const sourceLabel = (source: PluginSource) => language.t(SOURCE_KEYS[source])
  const scopeLabel = (scope: PluginScope) => language.t(SCOPE_KEYS[scope])

  const removePlugin = (item: PluginInfo) => {
    void serverSdk()
      .client.plugin.remove({ spec: item.spec, directory: props.directory() })
      .then(() => {
        void refetch()
        showToast({ variant: "success", title: language.t("settings.plugins.removeSucceeded") })
      })
      .catch(() => showToast({ title: language.t("settings.plugins.removeFailed") }))
  }

  const setPluginDescription = (item: PluginInfo, description: string) => {
    const cleared = description.trim() === ""
    void serverSdk()
      .client.plugin.setDescription({ spec: item.spec, directory: props.directory(), description })
      .then(() => {
        dialog.close()
        void refetch()
        showToast({
          variant: "success",
          title: language.t(
            cleared ? "settings.plugins.descriptionResetSucceeded" : "settings.plugins.descriptionSaveSucceeded",
          ),
        })
      })
      .catch(() =>
        showToast({
          title: language.t(
            cleared ? "settings.plugins.descriptionResetFailed" : "settings.plugins.descriptionSaveFailed",
          ),
        }),
      )
  }

  const editDescription = (item: PluginInfo) => {
    const [value, setValue] = createSignal(item.description ?? "")

    dialog.push(() => (
      <DialogV2 fit variant="settings">
        <DialogHeader>
          <DialogTitleGroup
            title={language.t("settings.plugins.editDescription")}
            description={item.name}
          />
        </DialogHeader>
        <DialogBody class="overflow-y-auto">
          <TextareaV2
            autofocus
            rows={5}
            value={value()}
            placeholder={language.t("settings.plugins.descriptionPlaceholder")}
            onInput={(event) => setValue(event.currentTarget.value)}
          />
        </DialogBody>
        <DialogFooter>
          <Show when={item.descriptionOverridden}>
            <ButtonV2 variant="ghost" onClick={() => setPluginDescription(item, "")}>
              {language.t("settings.plugins.resetDescription")}
            </ButtonV2>
          </Show>
          <ButtonV2 variant="ghost" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </ButtonV2>
          <ButtonV2 onClick={() => setPluginDescription(item, value())}>
            {language.t("common.save")}
          </ButtonV2>
        </DialogFooter>
      </DialogV2>
    ))
  }

  const confirmRemove = (item: PluginInfo) => {
    dialog.push(() => (
      <DialogV2 fit>
        <DialogHeader hideClose>
          <DialogTitleGroup
            title={language.t("settings.plugins.removeConfirm.title")}
            description={language.t("settings.plugins.removeConfirm.message", { name: item.name })}
          />
        </DialogHeader>
        <DialogFooter>
          <ButtonV2 variant="ghost" autofocus onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </ButtonV2>
          <ButtonV2
            variant="danger"
            onClick={() => {
              dialog.close()
              removePlugin(item)
            }}
          >
            {language.t("settings.plugins.remove")}
          </ButtonV2>
        </DialogFooter>
      </DialogV2>
    ))
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.plugins.title")}</h2>
      </div>

      <div class="settings-v2-tab-body settings-v2-providers">
        <Show
          when={!plugins.loading && !plugins.error}
          fallback={
            <div class="settings-v2-provider-empty">
              {plugins.loading ? language.t("settings.plugins.loading") : language.t("common.requestFailed")}
            </div>
          }
        >
          <Show
            when={list().length > 0}
            fallback={<div class="settings-v2-provider-empty">{language.t("settings.plugins.empty")}</div>}
          >
            <SettingsListV2>
              <For each={list()}>
                {(item) => (
                  <div class="settings-v2-provider-row group">
                    <div class="settings-v2-provider-lead">
                      <div class="settings-v2-provider-copy">
                        <div class="settings-v2-provider-main">
                          <span class="settings-v2-provider-name truncate">{item.name}</span>
                          <Tag>{sourceLabel(item.source)}</Tag>
                          <Tag>{scopeLabel(item.scope)}</Tag>
                          <Show when={item.descriptionOverridden}>
                            <Tag variant="accent">{language.t("settings.plugins.customized")}</Tag>
                          </Show>
                        </div>
                        <Show when={intro(item)}>
                          <p class="settings-v2-provider-description">{intro(item)}</p>
                        </Show>
                      </div>
                    </div>
                    <ButtonV2 size="normal" variant="ghost-muted" icon="edit" onClick={() => editDescription(item)}>
                      {language.t("settings.plugins.editDescription")}
                    </ButtonV2>
                    <ButtonV2 size="normal" variant="ghost-muted" onClick={() => confirmRemove(item)}>
                      {language.t("settings.plugins.remove")}
                    </ButtonV2>
                  </div>
                )}
              </For>
            </SettingsListV2>
          </Show>
        </Show>
      </div>
    </>
  )
}
