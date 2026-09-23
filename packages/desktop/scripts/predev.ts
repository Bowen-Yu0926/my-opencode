import { $ } from "bun"
import { downloadCliToResources, windowsify } from "./utils"
import { join } from "node:path"

const force = Bun.env.OPENCODE_FORCE_PREDEV === "1"

async function exists(path: string) {
  return Bun.file(path).exists()
}

async function newestMtime(dir: string) {
  let newest = 0
  for (const pattern of ["src/**/*.{ts,tsx}", "package.json"]) {
    const glob = new Bun.Glob(pattern)
    for await (const file of glob.scan({ cwd: dir, absolute: true, onlyFiles: true })) {
      const stat = await Bun.file(file).stat()
      if (stat && stat.mtimeMs > newest) newest = stat.mtimeMs
    }
  }
  return newest
}

function electronBinary() {
  if (process.platform === "win32") return "node_modules/electron/dist/electron.exe"
  if (process.platform === "darwin") return "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
  return "node_modules/electron/dist/electron"
}

if (force || !(await exists(electronBinary()))) {
  await $`bun run install-electron`
} else {
  console.log("skip: electron")
}

const channel = process.env.OPENCODE_CHANNEL ?? "dev"
if (force || !(await exists("resources/icons/icon.ico"))) {
  await $`bun ./scripts/copy-icons.ts ${channel}`
} else {
  console.log("skip: icons")
}

const opencodeDir = join(import.meta.dir, "../../opencode")
const nodeBundle = join(opencodeDir, "dist/node/node.js")
const bundleStat = await Bun.file(nodeBundle).stat().catch(() => undefined)
const nodeStale = force || !bundleStat || (await newestMtime(opencodeDir)) > bundleStat.mtimeMs
if (nodeStale) {
  await $`cd ../opencode && bun script/build-node.ts`
} else {
  console.log("skip: node bundle")
}

const cliDest = windowsify("resources/opencode-cli")
if (force || !(await exists(cliDest))) {
  await downloadCliToResources()
} else {
  console.log("skip: CLI")
}
