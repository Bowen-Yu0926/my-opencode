import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import path from "node:path"
import { app } from "electron"

function bunCommand() {
  if (process.platform === "win32") {
    const home = process.env.USERPROFILE || process.env.HOME
    if (home) {
      const candidate = path.join(home, ".bun", "bin", "bun.exe")
      if (existsSync(candidate)) return candidate
    }
  }
  return "bun"
}

/**
 * Restart the desktop app.
 *
 * Packaged builds can use Electron's built-in relaunch. In electron-vite /
 * unpackaged dev, `app.relaunch()` often loses the app root and retries as
 * `electron C:\Users\<you>` ("Unable to find Electron app at ...").
 *
 * When ELECTRON_RENDERER_URL is set, the renderer is served by a separate Vite
 * process. Restarting Electron alone reconnects to a dead localhost:5173
 * (ERR_CONNECTION_REFUSED). Restart the full `bun run dev` pipeline instead.
 */
export function relaunchApp() {
  if (app.isPackaged) {
    app.relaunch()
    app.exit(0)
    return
  }

  const appPath = app.getAppPath()

  if (process.env.ELECTRON_RENDERER_URL) {
    spawn(bunCommand(), ["run", "dev"], {
      detached: true,
      stdio: "ignore",
      cwd: appPath,
      env: process.env,
      shell: process.platform === "win32",
      windowsHide: true,
    }).unref()
    app.exit(0)
    return
  }

  const home = process.env.USERPROFILE || process.env.HOME
  const switches = process.argv.slice(1).filter((arg) => arg.startsWith("--") || arg.startsWith("-"))
  const args = [...switches, appPath].filter((arg) => arg !== "." && arg !== home)

  spawn(process.execPath, args, {
    detached: true,
    stdio: "ignore",
    cwd: appPath,
    env: process.env,
    windowsHide: true,
  }).unref()

  app.exit(0)
}
