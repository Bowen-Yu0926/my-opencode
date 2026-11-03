import { getFilename } from "@opencode-ai/core/util/path"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useMutation } from "@tanstack/solid-query"
import { normalizeProjectInfo } from "@/context/global-sync/utils"
import { batch, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobal } from "@/context/global"
import { type LocalProject, useLayout } from "@/context/layout"
import { ServerConnection } from "@/context/server"
import { pathKey } from "@/utils/path-key"

export function createEditProjectModel(props: { project: LocalProject; server: ServerConnection.Any }) {
  const dialog = useDialog()
  const global = useGlobal()
  const layout = useLayout()
  const serverCtx = createMemo(() => global.ensureServerCtx(props.server))
  const folderName = createMemo(() => getFilename(props.project.worktree))
  const defaultName = createMemo(() => props.project.name || folderName())
  const [store, setStore] = createStore({
    name: defaultName(),
    color: props.project.icon?.color,
    iconOverride: props.project.icon?.override,
    startup: props.project.commands?.start ?? "",
    directory: props.project.worktree,
    dragOver: false,
    iconHover: false,
  })
  let iconInput: HTMLInputElement | undefined

  function selectFile(file: File) {
    if (!file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result
      if (typeof result !== "string") return
      setStore("iconOverride", result)
      setStore("iconHover", false)
    }
    reader.readAsDataURL(file)
  }

  function drop(event: DragEvent) {
    event.preventDefault()
    setStore("dragOver", false)
    const file = event.dataTransfer?.files[0]
    if (file) selectFile(file)
  }

  function dragOver(event: DragEvent) {
    event.preventDefault()
    setStore("dragOver", true)
  }

  function dragLeave() {
    setStore("dragOver", false)
  }

  function inputChange(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0]
    if (file) selectFile(file)
  }

  function iconClick() {
    if (store.iconOverride && store.iconHover) {
      setStore("iconOverride", "")
      return
    }
    iconInput?.click()
  }

  const save = useMutation(() => ({
    mutationFn: async () => {
      const name = store.name.trim() === folderName() ? "" : store.name.trim()
      const start = store.startup.trim()
      const nextDirectory = store.directory.trim()
      const directory =
        nextDirectory && pathKey(nextDirectory) !== pathKey(props.project.worktree) ? nextDirectory : undefined

      if (props.project.id && props.project.id !== "global") {
        const project = await serverCtx().sdk.api.project.update({
          projectID: props.project.id,
          name,
          icon: { color: store.color || "", override: store.iconOverride || "" },
          commands: { start },
          ...(directory ? { directory } : {}),
        })
        if (!project) return
        const next = normalizeProjectInfo(project)
        batch(() => {
          serverCtx().sync.set("project", (items) => items.map((item) => (item.id === next.id ? next : item)))
          if (pathKey(props.project.worktree) !== pathKey(next.worktree)) {
            serverCtx().projects.relocate(props.project.worktree, next.worktree)
            const selection = layout.home.selection()
            if (selection.directory && pathKey(selection.directory) === pathKey(props.project.worktree)) {
              layout.home.setSelection({ server: selection.server, directory: next.worktree })
            }
          }
          serverCtx().sync.project.icon(next.worktree, store.iconOverride || undefined)
        })
        dialog.close()
        return
      }

      serverCtx().sync.project.meta(props.project.worktree, {
        name,
        icon: { color: store.color || undefined, override: store.iconOverride || undefined },
        commands: { start: start || undefined },
      })
      dialog.close()
    },
  }))

  function submit(event: SubmitEvent) {
    event.preventDefault()
    if (save.isPending) return
    save.mutate()
  }

  return {
    store,
    setStore,
    folderName,
    defaultName,
    save,
    submit,
    drop,
    dragOver,
    dragLeave,
    inputChange,
    iconClick,
    close() {
      dialog.close()
    },
    setIconInput(input: HTMLInputElement) {
      iconInput = input
    },
  }
}
