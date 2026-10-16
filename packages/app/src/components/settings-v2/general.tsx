import { Component, Show, createMemo, type Accessor } from "solid-js"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { SelectV2 } from "@opencode-ai/ui/v2/select-v2"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useUpdaterAction } from "../updater-action"
import { useSettings } from "@/context/settings"
import { SettingsListV2 } from "./parts/list"
import { SettingsRowV2 } from "./parts/row"
import {
  createAppearanceSettingsController,
  createPermissionScopeController,
  createShellOptions,
  createShellSettingsController,
  type AppearanceSettingsController,
  type PermissionScopeController,
  type ShellSettingsController,
} from "./general-controllers"
import "./settings-v2.css"

const schemeOptions: ("system" | "light" | "dark")[] = ["system", "light", "dark"]
const fontSettings = {
  ui: {
    action: "settings-ui-font",
    title: "settings.general.row.uiFont.title",
    description: "settings.general.row.uiFont.description",
    font: "ui",
    input: "setUI",
  },
  code: {
    action: "settings-code-font",
    title: "settings.general.row.font.title",
    description: "settings.general.row.font.description",
    font: "code",
    input: "setCode",
  },
  terminal: {
    action: "settings-terminal-font",
    title: "settings.general.row.terminalFont.title",
    description: "settings.general.row.terminalFont.description",
    font: "terminal",
    input: "setTerminal",
  },
} as const

const PermissionScopeSetting: Component<{ controller: PermissionScopeController }> = (props) => {
  const language = useLanguage()
  return (
    <SettingsRowV2
      title={language.t("command.permissions.autoaccept.enable")}
      description={language.t("toast.permissions.autoaccept.on.description")}
    >
      <div data-action="settings-auto-accept-permissions">
        <Switch
          checked={props.controller.accepting()}
          disabled={!props.controller.enabled()}
          onChange={props.controller.set}
        />
      </div>
    </SettingsRowV2>
  )
}

const ShellSetting: Component<{ controller: ShellSettingsController }> = (props) => {
  const language = useLanguage()
  const options = createMemo(() =>
    createShellOptions({
      shells: props.controller.shells(),
      current: props.controller.current(),
    }),
  )
  return (
    <SettingsRowV2
      title={language.t("settings.general.row.shell.title")}
      description={language.t("settings.general.row.shell.description")}
    >
      <SelectV2
        appearance="inline"
        data-action="settings-shell"
        options={options()}
        current={options().find((option) => option.value === props.controller.current()) ?? options()[0]}
        placement="bottom-end"
        gutter={6}
        value={(option) => option.id}
        label={(option) => {
          if (option.id === "auto") return language.t("settings.general.row.shell.autoDefault")
          if (!option.terminalOnly) return option.name
          return `${option.name} (${language.t("settings.general.row.shell.terminalOnly")})`
        }}
        onSelect={(option) => option && props.controller.select(option.value)}
      />
    </SettingsRowV2>
  )
}

const AppearanceSection: Component<{ controller: AppearanceSettingsController }> = (props) => {
  const language = useLanguage()
  return (
    <div class="settings-v2-section">
      <h3 class="settings-v2-section-title">{language.t("settings.general.section.appearance")}</h3>
      <SettingsListV2>
        <SettingsRowV2
          title={language.t("settings.general.row.colorScheme.title")}
          description={language.t("settings.general.row.colorScheme.description")}
        >
          <SelectV2
            appearance="inline"
            data-action="settings-color-scheme"
            options={schemeOptions}
            current={schemeOptions.find((option) => option === props.controller.scheme.current())}
            placement="bottom-end"
            gutter={6}
            label={(option) => {
              if (option === "system") return language.t("theme.scheme.system")
              if (option === "light") return language.t("theme.scheme.light")
              return language.t("theme.scheme.dark")
            }}
            onSelect={(option) => option && props.controller.scheme.select(option)}
          />
        </SettingsRowV2>

        <SettingsRowV2
          title={language.t("settings.general.row.theme.title")}
          description={language.t("settings.general.row.theme.description")}
        >
          <SelectV2
            appearance="inline"
            data-action="settings-theme"
            options={props.controller.theme.options()}
            current={props.controller.theme.current()}
            placement="bottom-end"
            gutter={6}
            value={(option) => option.id}
            label={(option) => option.name}
            onSelect={props.controller.theme.select}
          />
        </SettingsRowV2>

        <FontSetting kind="ui" fonts={props.controller.fonts} />
        <FontSetting kind="code" fonts={props.controller.fonts} />
        <FontSetting kind="terminal" fonts={props.controller.fonts} />
      </SettingsListV2>
    </div>
  )
}

const FontSetting: Component<{
  kind: "ui" | "code" | "terminal"
  fonts: AppearanceSettingsController["fonts"]
}> = (props) => {
  const language = useLanguage()
  const config = () => fontSettings[props.kind]
  return (
    <SettingsRowV2 title={language.t(config().title)} description={language.t(config().description)}>
      <div class="w-full sm:w-[220px]">
        <TextInputV2
          data-action={config().action}
          type="text"
          appearance="base"
          value={props.fonts[config().font]().value}
          onInput={(event) => props.fonts[config().input](event.currentTarget.value)}
          placeholder={props.fonts[config().font]().placeholder}
          spellcheck={false}
          autocorrect="off"
          autocomplete="off"
          autocapitalize="off"
          aria-label={language.t(config().title)}
          style={{ "font-family": props.fonts[config().font]().family }}
        />
      </div>
    </SettingsRowV2>
  )
}

const LanguageSetting = () => {
  const language = useLanguage()
  const options = createMemo(() =>
    language.locales.map((locale) => ({
      value: locale,
      label: language.label(locale),
    })),
  )
  return (
    <SettingsRowV2
      title={language.t("settings.general.row.language.title")}
      description={language.t("settings.general.row.language.description")}
    >
      <SelectV2
        appearance="inline"
        data-action="settings-language"
        options={options()}
        placement="bottom-end"
        gutter={6}
        current={options().find((option) => option.value === language.locale())}
        value={(option) => option.value}
        label={(option) => option.label}
        onSelect={(option) => option && language.setLocale(option.value)}
      />
    </SettingsRowV2>
  )
}

export const SettingsGeneralV2: Component<{
  sessionID?: string
  directory?: Accessor<string | undefined>
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const settings = useSettings()
  const updater = useUpdaterAction()
  const permissionScope = createPermissionScopeController({
    sessionID: () => props.sessionID,
    directory: () => props.directory?.() ?? undefined,
  })
  const shell = createShellSettingsController()
  const appearance = createAppearanceSettingsController()
  const desktop = createMemo(() => platform.platform === "desktop")

  return (
    <>
      <div class="settings-v2-tab-header">
        <h2 class="settings-v2-tab-title">{language.t("settings.tab.general")}</h2>
      </div>

      <div class="settings-v2-tab-body">
        <div class="settings-v2-section">
          <SettingsListV2>
            <LanguageSetting />

            <PermissionScopeSetting controller={permissionScope} />

            <ShellSetting controller={shell} />

            <SettingsRowV2
              title={language.t("settings.general.row.reasoningSummaries.title")}
              description={language.t("settings.general.row.reasoningSummaries.description")}
            >
              <div data-action="settings-feed-reasoning-summaries">
                <Switch
                  checked={settings.general.showReasoningSummaries()}
                  onChange={(checked) => settings.general.setShowReasoningSummaries(checked)}
                />
              </div>
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.general.row.shellToolPartsExpanded.title")}
              description={language.t("settings.general.row.shellToolPartsExpanded.description")}
            >
              <div data-action="settings-feed-shell-tool-parts-expanded">
                <Switch
                  checked={settings.general.shellToolPartsExpanded()}
                  onChange={(checked) => settings.general.setShellToolPartsExpanded(checked)}
                />
              </div>
            </SettingsRowV2>

            <SettingsRowV2
              title={language.t("settings.general.row.editToolPartsExpanded.title")}
              description={language.t("settings.general.row.editToolPartsExpanded.description")}
            >
              <div data-action="settings-feed-edit-tool-parts-expanded">
                <Switch
                  checked={settings.general.editToolPartsExpanded()}
                  onChange={(checked) => settings.general.setEditToolPartsExpanded(checked)}
                />
              </div>
            </SettingsRowV2>
          </SettingsListV2>
        </div>

        <AppearanceSection controller={appearance} />

        <Show when={desktop()}>
          <div class="settings-v2-section">
            <h3 class="settings-v2-section-title">{language.t("settings.general.section.updates")}</h3>

            <SettingsListV2>
              <SettingsRowV2
                title={language.t("settings.updates.row.check.title")}
                description={language.t("settings.updates.row.check.description")}
              >
                <ButtonV2
                  size="normal"
                  variant="neutral"
                  disabled={!updater.action().run}
                  onClick={() => void updater.run()}
                >
                  {language.t(updater.action().label)}
                </ButtonV2>
              </SettingsRowV2>
            </SettingsListV2>
          </div>
        </Show>
      </div>
    </>
  )
}
