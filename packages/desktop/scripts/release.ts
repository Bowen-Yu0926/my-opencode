#!/usr/bin/env bun
import { $ } from "bun"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

// 本地发布脚本：bump 版本 -> 提交 -> 推送 tag，由 GitHub Actions 打包并发布
// 用法：
//   bun scripts/release.ts            # 自动 bump patch（2.0.32 -> 2.0.33）
//   bun scripts/release.ts 2.1.0      # 手动指定版本号
const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const repoRoot = path.resolve(desktopDir, "../..")
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

const status = await $`git status --porcelain`.cwd(repoRoot).text()
if (status.trim()) {
  console.error("工作区有未提交改动，请先提交或清理后再发布。")
  process.exit(1)
}

console.log(`版本 ${current} -> ${next}`)
pkg.version = next
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

const message = `chore(desktop): bump to ${next}`
await $`git add packages/desktop/package.json`.cwd(repoRoot)
await $`git commit -m ${message}`.cwd(repoRoot)
await $`git push origin HEAD`.cwd(repoRoot)

const tag = `v${next}`
console.log(`创建并推送 git tag ${tag}...`)
await $`git tag ${tag}`.cwd(repoRoot)
await $`git push origin ${tag}`.cwd(repoRoot)

console.log(`\n完成：已推送 ${tag}。`)
console.log("GitHub Actions「desktop-release」会打包 Windows 安装包并发布到 GitHub Release。")
console.log(`查看进度：https://github.com/Bowen-Yu0926/my-opencode/actions`)
