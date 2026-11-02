import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogV2, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode-ai/ui/v2/dialog-v2"
import { TextareaV2 } from "@opencode-ai/ui/v2/textarea-v2"
import { Markdown } from "@opencode-ai/session-ui/markdown"
import { showToast } from "@/utils/toast"
import { createMemo, createResource, createSignal, type Accessor, type Component, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { usePlatform } from "@/context/platform"
import { SettingsListV2 } from "./parts/list"
import "./settings-v2.css"

type SkillSource = "builtin" | "global" | "project" | "config" | "url"

type SkillItem = {
  name: string
  description?: string
  descriptionOverridden?: boolean
  location: string
  content: string
  source: SkillSource
}

const SOURCE_KEYS: Record<SkillSource, string> = {
  builtin: "settings.skills.source.builtin",
  global: "settings.skills.source.global",
  project: "settings.skills.source.project",
  config: "settings.skills.source.config",
  url: "settings.skills.source.url",
}

const intro = (item: SkillItem) => {
  const raw = item.description
  if (!raw) return undefined
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw
}

export const SettingsSkillsV2: Component<{ directory: Accessor<string | undefined> }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()
  const serverSdk = useServerSDK()
  const platform = usePlatform()

  const [skills, { refetch }] = createResource(
    () => ({ directory: props.directory() }),
    (input) => serverSdk().client.app.skills({ directory: input.directory }),
  )

  const list = createMemo<SkillItem[]>(() => (skills()?.data ?? []).filter((item) => item.source !== "builtin"))

  const removable = (item: SkillItem) => item.source !== "builtin" && item.source !== "url"

  const sourceLabel = (source: SkillSource) => language.t(SOURCE_KEYS[source])

  const removeSkill = (item: SkillItem) => {
    void serverSdk()
      .client.skill.remove({ name: item.name, directory: props.directory() })
      .then(() => void refetch())
      .catch(() => showToast({ title: language.t("settings.skills.removeFailed") }))
  }

  const moveSkill = (item: SkillItem, to: "global" | "project") => {
    void serverSdk()
      .client.skill.move({ name: item.name, to, directory: props.directory() })
      .then(() => void refetch())
      .catch(() => showToast({ title: language.t("settings.skills.moveFailed") }))
  }

  const openSkillFolder = (item: SkillItem) => {
    if (!platform.openPath) return
    void platform
      .openPath(item.location.replace(/[\\/]SKILL\.md$/, ""))
      .catch(() => showToast({ title: language.t("settings.skills.openFailed") }))
  }

  const viewDetail = (item: SkillItem) => {
    dialog.show(() => (
      <DialogV2 size="x-large" variant="settings">
        <DialogHeader>
          <DialogTitleGroup
            title={item.name}
            description={`${language.t("settings.skills.location")} ${item.location}`}
          />
        </DialogHeader>
        <DialogBody class="overflow-y-auto">
          <Markdown text={item.content} class="text-14-regular" />
        </DialogBody>
        <DialogFooter>
          <ButtonV2 variant="ghost" autofocus onClick={() => dialog.close()}>
            {language.t("common.close")}
          </ButtonV2>
        </DialogFooter>
      </DialogV2>
    ))
  }

  const setSkillDescription = (item: SkillItem, description: string) => {
    const cleared = description.trim() === ""
    void serverSdk()
      .client.skill.setDescription({ name: item.name, directory: props.directory(), description })
      .then(() => {
        dialog.close()
        void refetch()
        showToast({
          variant: "success",
          title: language.t(
            cleared ? "settings.skills.descriptionResetSucceeded" : "settings.skills.descriptionSaveSucceeded",
          ),
        })
      })
      .catch(() =>
        showToast({
          title: language.t(
            cleared ? "settings.skills.descriptionResetFailed" : "settings.skills.descriptionSaveFailed",
          ),
        }),
      )
  }

  const editDescription = (item: SkillItem) => {
    const [value, setValue] = createSignal(item.description ?? "")

    dialog.show(() => (
      <DialogV2 fit variant="settings">
        <DialogHeader>
          <DialogTitleGroup
            title={language.t("settings.skills.editDescription")}
            description={item.name}
          />
        </DialogHeader>
        <DialogBody class="overflow-y-auto">
          <TextareaV2
            autofocus
            rows={5}
            value={value()}
            placeholder={language.t("settings.skills.descriptionPlaceholder")}
            onInput={(event) => setValue(event.currentTarget.value)}
          />
        </DialogBody>
        <DialogFooter>
          <Show when={item.descriptionOverridden}>
            <ButtonV2 variant="ghost" onClick={() => setSkillDescription(item, "")}>
              {language.t("settings.skills.resetDescription")}
            </ButtonV2>
          </Show>
          <ButtonV2 variant="ghost" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </ButtonV2>
          <ButtonV2 onClick={() => setSkillDescription(item, value())}>
            {language.t("common.save")}
          </ButtonV2>
        </DialogFooter>
      </DialogV2>
    ))
  }

  const confirmRemove = (item: SkillItem) => {
    dialog.show(() => (
      <DialogV2 fit>
        <DialogHeader hideClose>
          <DialogTitleGroup
            title={language.t("settings.skills.removeConfirm.title")}
            description={language.t("settings.skills.removeConfirm.message", { name: item.name })}
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
              removeSkill(item)
            }}
          >
            {language.t("settings.skills.remove")}
          </ButtonV2>
        </DialogFooter>
      </DialogV2>
    ))
  }

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.skills.title")}</h2>
      </div>

      <div class="settings-v2-tab-body settings-v2-providers">
        <Show
          when={!skills.loading && !skills.error}
          fallback={
            <div class="settings-v2-provider-empty">
              {skills.loading ? language.t("settings.skills.loading") : language.t("common.requestFailed")}
            </div>
          }
        >
          <Show
            when={list().length > 0}
            fallback={<div class="settings-v2-provider-empty">{language.t("settings.skills.empty")}</div>}
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
                          <Show when={item.descriptionOverridden}>
                            <Tag variant="accent">{language.t("settings.skills.customized")}</Tag>
                          </Show>
                        </div>
                        <Show when={intro(item)}>
                          <p class="settings-v2-provider-description">{intro(item)}</p>
                        </Show>
                        <p class="settings-v2-provider-description">
                          {language.t("settings.skills.location")} {item.location}
                        </p>
                      </div>
                    </div>
                    <ButtonV2 size="normal" variant="ghost-muted" onClick={() => viewDetail(item)}>
                      {language.t("settings.skills.viewDetail")}
                    </ButtonV2>
                    <ButtonV2 size="normal" variant="ghost-muted" icon="edit" onClick={() => editDescription(item)}>
                      {language.t("settings.skills.editDescription")}
                    </ButtonV2>
                    <Show when={platform.platform === "desktop" && !!platform.openPath}>
                      <ButtonV2 size="normal" variant="ghost-muted" onClick={() => openSkillFolder(item)}>
                        {language.t("settings.skills.openFolder")}
                      </ButtonV2>
                    </Show>
                    <Show when={item.source === "global"}>
                      <ButtonV2 size="normal" variant="ghost-muted" onClick={() => moveSkill(item, "project")}>
                        {language.t("settings.skills.moveToProject")}
                      </ButtonV2>
                    </Show>
                    <Show when={item.source === "project"}>
                      <ButtonV2 size="normal" variant="ghost-muted" onClick={() => moveSkill(item, "global")}>
                        {language.t("settings.skills.moveToGlobal")}
                      </ButtonV2>
                    </Show>
                    <Show
                      when={removable(item)}
                      fallback={
                        <ButtonV2 size="normal" variant="ghost-muted" disabled>
                          {language.t("settings.skills.remove")}
                        </ButtonV2>
                      }
                    >
                      <ButtonV2 size="normal" variant="ghost-muted" onClick={() => confirmRemove(item)}>
                        {language.t("settings.skills.remove")}
                      </ButtonV2>
                    </Show>
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
