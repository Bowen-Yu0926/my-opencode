import { describe, expect, test } from "bun:test"
import {
  createUpdaterController,
  type UpdaterBackend,
  type UpdaterDismissedRecord,
  type UpdaterReadyRecord,
} from "./updater-controller"

function setup(input?: {
  currentVersion?: string
  ready?: UpdaterReadyRecord
  dismissed?: UpdaterDismissedRecord
  updateVersion?: string
}) {
  const calls: string[] = []
  let progressCb: ((percent: number) => void) | undefined
  const backend: UpdaterBackend = {
    async checkForUpdates() {
      calls.push("check")
      return { isUpdateAvailable: true, updateInfo: { version: input?.updateVersion ?? "2.0.0" } }
    },
    async downloadUpdate() {
      calls.push("download")
      progressCb?.(50)
    },
    onDownloadProgress(cb) {
      progressCb = cb
      return () => {
        progressCb = undefined
      }
    },
    quitAndInstall() {
      calls.push("install")
    },
  }
  let ready = input?.ready
  let dismissed = input?.dismissed
  const controller = createUpdaterController({
    enabled: true,
    currentVersion: input?.currentVersion ?? "1.0.0",
    backend,
    persistence: {
      getReady: () => ready,
      setReady: (value) => {
        ready = value
      },
      clearReady: () => {
        ready = undefined
      },
      getDismissed: () => dismissed,
      setDismissed: (value) => {
        dismissed = value
      },
      clearDismissed: () => {
        dismissed = undefined
      },
    },
    stop: async () => {
      calls.push("stop")
    },
  })
  return { controller, calls, getReady: () => ready, getDismissed: () => dismissed }
}

describe("updater controller", () => {
  test("offers update-available on check and only downloads when requested", async () => {
    const app = setup()
    const states: ReturnType<typeof app.controller.getState>[] = []
    app.controller.subscribe((state) => states.push(state))

    await app.controller.start()

    expect(app.calls).toEqual(["check"])
    expect(app.getReady()).toBeUndefined()
    expect(states.map((state) => state.status)).toEqual(["idle", "checking", "update-available"])
    expect(app.controller.getState()).toEqual({ status: "update-available", version: "2.0.0" })

    await app.controller.download()

    expect(app.calls).toEqual(["check", "download"])
    expect(app.getReady()).toEqual({ version: "2.0.0" })
    expect(states).toContainEqual({ status: "downloading", version: "2.0.0", percent: 50 })
    expect(app.controller.getState()).toEqual({ status: "ready", version: "2.0.0" })
  })

  test("dismiss persists the version and re-checking the same version stays dismissed", async () => {
    const app = setup()
    await app.controller.start()

    await app.controller.dismiss()

    expect(app.getDismissed()).toEqual({ version: "2.0.0" })
    expect(app.controller.getState()).toEqual({ status: "dismissed", version: "2.0.0" })

    await app.controller.check()

    expect(app.controller.getState()).toEqual({ status: "dismissed", version: "2.0.0" })
  })

  test("check offers a new version that differs from the dismissed version", async () => {
    const app = setup({ dismissed: { version: "2.0.0" }, updateVersion: "3.0.0" })

    await app.controller.start()

    expect(app.controller.getState()).toEqual({ status: "update-available", version: "3.0.0" })
  })

  test("resumes a persisted ready target on launch without re-checking", async () => {
    const app = setup({ ready: { version: "2.0.0" } })

    await app.controller.start()

    expect(app.calls).toEqual([])
    expect(app.controller.getState()).toEqual({ status: "ready", version: "2.0.0" })
  })

  test("clears a target already installed before checking", async () => {
    const app = setup({ currentVersion: "2.0.0", ready: { version: "2.0.0" } })

    await app.controller.start()

    expect(app.getReady()).toBeUndefined()
    expect(app.calls).toEqual(["check"])
    expect(app.controller.getState()).toEqual({ status: "up-to-date" })
  })

  test("coalesces concurrent checks", async () => {
    const app = setup()

    await Promise.all([app.controller.check(), app.controller.check(), app.controller.check()])

    expect(app.calls).toEqual(["check"])
    expect(app.controller.getState()).toEqual({ status: "update-available", version: "2.0.0" })
  })

  test("download rejects when no update is available", async () => {
    const app = setup()

    await expect(app.controller.download()).rejects.toThrow("Update is not available to download")
  })

  test("dismiss rejects when no update is available", async () => {
    const app = setup()

    await expect(app.controller.dismiss()).rejects.toThrow("Update is not available to dismiss")
  })

  test("returns to ready when quitAndInstall returns without exiting", async () => {
    const app = setup()
    await app.controller.start()
    await app.controller.download()

    await app.controller.install()

    expect(app.calls).toEqual(["check", "download", "stop", "install"])
    expect(app.controller.getState()).toEqual({ status: "ready", version: "2.0.0" })
  })

  test("returns to ready when installation cannot start", async () => {
    const app = setup()
    await app.controller.start()
    await app.controller.download()

    const failed = createUpdaterController({
      enabled: true,
      currentVersion: "1.0.0",
      backend: {
        checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version: "2.0.0" } }),
        downloadUpdate: async () => {},
        quitAndInstall() {},
      },
      persistence: {
        getReady: () => undefined,
        setReady() {},
        clearReady() {},
        getDismissed: () => undefined,
        setDismissed() {},
        clearDismissed() {},
      },
      stop: async () => {
        throw new Error("stop failed")
      },
    })
    await failed.start()
    await failed.download()

    await expect(failed.install()).rejects.toThrow("stop failed")
    expect(failed.getState()).toEqual({ status: "ready", version: "2.0.0" })
  })
})
