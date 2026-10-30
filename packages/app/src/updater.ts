import type { Accessor } from "solid-js"

export type UpdaterState =
  | { status: "disabled" }
  | { status: "idle" }
  | { status: "checking" }
  | { status: "update-available"; version: string }
  | { status: "downloading"; version: string; percent?: number }
  | { status: "ready"; version: string }
  | { status: "up-to-date" }
  | { status: "dismissed"; version: string }
  | { status: "installing"; version: string }
  | { status: "error"; message: string }

export type UpdaterPlatform = {
  state: Accessor<UpdaterState>
  check(): Promise<UpdaterState>
  download(): Promise<void>
  dismiss(): Promise<void>
  install(): Promise<void>
}
