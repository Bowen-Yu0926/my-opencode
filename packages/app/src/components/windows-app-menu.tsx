import { Show, For } from "solid-js"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"

import { useCommand } from "@/context/command"
import { DESKTOP_MENU, desktopMenuVisible, type DesktopMenuAction, type DesktopMenuEntry } from "@/desktop-menu"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"

export function WindowsAppMenu(props: {
  command: ReturnType<typeof useCommand>
  platform: ReturnType<typeof usePlatform>
  variant?: "legacy" | "v2"
}) {
  let lastFocused: HTMLElement | undefined
  const language = useLanguage()

  const rememberFocus = () => {
    const active = document.activeElement
    lastFocused = active instanceof HTMLElement ? active : undefined
  }
  const commandDisabled = (id: string) => {
    const option = props.command.options.find((option) => option.id === id)
    if (!option) return true
    return option.disabled ?? false
  }
  const runCommand = (id: string) => {
    if (commandDisabled(id)) return
    props.command.trigger(id)
  }
  const runAction = (action: DesktopMenuAction) => {
    if (action.startsWith("edit.") && lastFocused?.isConnected) lastFocused.focus({ preventScroll: true })
    void props.platform.runDesktopMenuAction?.(action)
  }
  const runEntry = (entry: DesktopMenuEntry) => {
    if (entry.type === "separator") return
    if (entry.command) {
      runCommand(entry.command)
      return
    }
    if (entry.action) {
      runAction(entry.action)
      return
    }
    if (entry.href) props.platform.openExternal(entry.href)
  }

  const menus = () => DESKTOP_MENU.filter((menu) => desktopMenuVisible(menu, "windows"))

  return (
    <div data-component="desktop-menu-bar" class="flex h-7 shrink-0 items-center gap-0.5">
      <For each={menus()}>
        {(menu) => (
          <DropdownMenu gutter={4} modal={false} placement="bottom-start">
            <DropdownMenu.Trigger
              as={ButtonV2}
              variant="ghost-muted"
              size="small"
              class={
                props.variant === "v2"
                  ? "h-7 rounded-[6px] px-2 text-[13px] leading-4 [font-weight:440] hover:text-v2-text-text-base"
                  : "h-7 px-2 text-[13px] leading-4"
              }
              onPointerDown={rememberFocus}
              onKeyDown={rememberFocus}
            >
              {language.t(menu.labelKey)}
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content class="desktop-app-menu">
                <DropdownMenu.Group>
                  <DropdownMenu.GroupLabel class="desktop-app-menu-heading">
                    {language.t(menu.labelKey)}
                  </DropdownMenu.GroupLabel>
                  <For each={menu.items?.filter((entry) => desktopMenuVisible(entry, "windows")) ?? []}>
                    {(entry) =>
                      entry.type === "separator" ? (
                        <DropdownMenu.Separator />
                      ) : (
                        <DesktopMenuItem
                          label={entry.labelKey ? language.t(entry.labelKey) : ""}
                          keybind={entry.command ? props.command.keybind(entry.command) : entry.accelerator?.windows}
                          disabled={entry.command ? commandDisabled(entry.command) : false}
                          onSelect={() => runEntry(entry)}
                        />
                      )
                    }
                  </For>
                </DropdownMenu.Group>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu>
        )}
      </For>
    </div>
  )
}

function DesktopMenuItem(props: { label: string; keybind?: string; disabled?: boolean; onSelect: () => void }) {
  return (
    <DropdownMenu.Item disabled={props.disabled} onSelect={props.onSelect}>
      <DropdownMenu.ItemLabel>{props.label}</DropdownMenu.ItemLabel>
      <Show when={props.keybind}>
        <span data-slot="desktop-app-menu-keybind">{props.keybind}</span>
      </Show>
    </DropdownMenu.Item>
  )
}
