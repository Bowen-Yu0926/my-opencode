import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Tag } from "@opencode-ai/ui/v2/badge-v2"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogV2, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode-ai/ui/v2/dialog-v2"
import { showToast } from "@/utils/toast"
import { createMemo, createResource, type Accessor, type Component, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { usePlatform } from "@/context/platform"
import { SettingsListV2 } from "./parts/list"
import "./settings-v2.css"

type SkillSource = "builtin" | "global" | "project" | "config" | "url"

type SkillItem = {
  name: string
  description?: string
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

const SKILL_INTROS: Record<string, string> = {
  "afrexai-qa-test-plan": "QA 测试计划与覆盖率矩阵生成",
  "api-test-automation": "API 接口测试自动化（REST/GraphQL）",
  "cli-anything-photoshop": "命令行操控 Photoshop（图层/选区/图像处理）",
  "cli-anything-wps": "命令行操控 WPS（PPT/文字/表格）",
  "cli-anything-zotero": "命令行操控 Zotero 文献管理",
  "e2e-testing-patterns": "E2E 端到端测试（Playwright/Cypress）",
  effect: "Effect v4 TypeScript 开发",
  "executable-testcases": "可执行测试用例生成与回归",
  "ppt-master": "AI 生成与美化 PPT 演示文稿",
  "rtl-aware-development": "桌面端 RTL 布局适配",
  "superpowers-tdd": "TDD 测试驱动开发（红-绿-重构）",
  "tech-test-automation": "自动化测试专家包（TDD/单元/E2E/API）",
  "test-case-generator": "生成标准 Excel 测试用例",
  "test-patterns": "跨语言测试编写与运行",
}

const intro = (item: SkillItem) => {
  const custom = SKILL_INTROS[item.name]
  if (custom) return custom
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
                        </div>
                        <Show when={intro(item)}>
                          <p class="settings-v2-provider-description">{intro(item)}</p>
                        </Show>
                        <p class="settings-v2-provider-description">
                          {language.t("settings.skills.location")} {item.location}
                        </p>
                      </div>
                    </div>
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
