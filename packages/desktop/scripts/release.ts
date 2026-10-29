#!/usr/bin/env bun
import { $ } from "bun"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

// 本地发布脚本：bump 版本 -> build -> 打包并发布到 GitHub release（Windows）
// 用法：
//   bun scripts/release.ts            # 自动 bump patch（2.0.32 -> 2.0.33）
//   bun scripts/release.ts 2.1.0      # 手动指定版本号
const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pkgPath = path.join(desktopDir, "package.json")

function bumpPatch(version: string) {
  const [major, minor, patch] = version.split(".").map(Number)
  return `${major}.${minor}.${patch + 1}`
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
const current = pkg.version
const next = Bun.argv[2] ?? bumpPatch(current)

if (next === current) {
  console.error(`版本号未变化（当前 ${current}）。请指定新版本，如 bun scripts/release.ts ${bumpPatch(current)}`)
  process.exit(1)
}

console.log(`版本 ${current} -> ${next}`)
pkg.version = next
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

const token =
  process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? (await $`gh auth token`.text()).trim()
if (!token) {
  console.error("无法获取 GitHub token：请先 gh auth login，或手动设置 GH_TOKEN")
  process.exit(1)
}
process.env.GH_TOKEN = token

console.log("构建中（prebuild + electron-vite build）...")
await $`bun run build`.cwd(desktopDir)

console.log("打包并发布到 GitHub release...")
await $`bun run package:win:publish`.cwd(desktopDir)

console.log(`\n完成：v${next} 已发布。`)
console.log(`旧版客户端（v${current}）下次启动会自动检测到更新并提示。`)
