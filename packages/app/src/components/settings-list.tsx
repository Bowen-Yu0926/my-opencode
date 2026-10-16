import { type Component, type JSX } from "solid-js"

export const SettingsList: Component<{ children: JSX.Element }> = (props) => {
  return (
    <div class="rounded-[6px] bg-v2-background-bg-layer-01 px-4 shadow-[inset_0_0_0_0.5px_var(--v2-border-border-muted)]">
      {props.children}
    </div>
  )
}
