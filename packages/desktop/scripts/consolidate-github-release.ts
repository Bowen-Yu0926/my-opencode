#!/usr/bin/env bun
/**
 * electron-builder can race and create two GitHub Releases for the same tag
 * (e.g. one with latest.yml+exe, another with only .blockmap). `/releases/latest`
 * then points at the incomplete one and auto-update fails with Failed to fetch.
 *
 * Merge assets onto the release that has latest.yml (preferring the one with the
 * installer), then delete the duplicates.
 *
 * Usage:
 *   GH_TOKEN=... bun scripts/consolidate-github-release.ts [version]
 *   # version defaults to packages/desktop/package.json
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pkg = JSON.parse(readFileSync(path.join(desktopDir, "package.json"), "utf8")) as { version: string }
const version = (Bun.argv[2] ?? pkg.version).replace(/^v/i, "")
const tag = `v${version}`
const owner = "Bowen-Yu0926"
const repo = "my-opencode"
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN
if (!token) throw new Error("GH_TOKEN or GITHUB_TOKEN is required")

type Asset = { id: number; name: string; size: number; url: string; browser_download_url: string }
type Release = {
  id: number
  tag_name: string
  name: string
  html_url: string
  assets: Asset[]
}

async function api<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${pathname} -> ${response.status} ${await response.text()}`)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const releases = (await api<Release[]>(`/repos/${owner}/${repo}/releases?per_page=40`)).filter(
  (release) => release.tag_name === tag || release.tag_name === version,
)

if (releases.length === 0) {
  console.log(`No releases found for ${tag}`)
  process.exit(0)
}

const score = (release: Release) => {
  const names = new Set(release.assets.map((asset) => asset.name))
  let value = release.assets.length
  if (names.has("latest.yml")) value += 100
  if ([...names].some((name) => name.endsWith(".exe"))) value += 50
  return value
}

const sorted = [...releases].sort((a, b) => score(b) - score(a))
const keeper = sorted[0]!
const extras = sorted.slice(1)

console.log(
  `keeper=${keeper.id} assets=${keeper.assets.map((asset) => asset.name).join(",") || "(none)"} duplicates=${extras.length}`,
)

for (const extra of extras) {
  for (const asset of extra.assets) {
    if (keeper.assets.some((existing) => existing.name === asset.name)) {
      console.log(`skip existing ${asset.name}`)
      continue
    }
    console.log(`copy ${asset.name} from release ${extra.id}`)
    const download = await fetch(asset.url, {
      headers: {
        Accept: "application/octet-stream",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "follow",
    })
    if (!download.ok) throw new Error(`download ${asset.name} failed: ${download.status}`)
    const body = Buffer.from(await download.arrayBuffer())
    const uploadUrl = `https://uploads.github.com/repos/${owner}/${repo}/releases/${keeper.id}/assets?name=${encodeURIComponent(asset.name)}`
    const upload = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(body.byteLength),
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body,
    })
    if (!upload.ok) throw new Error(`upload ${asset.name} failed: ${upload.status} ${await upload.text()}`)
    keeper.assets.push((await upload.json()) as Asset)
  }
  console.log(`delete duplicate release ${extra.id}`)
  await api(`/repos/${owner}/${repo}/releases/${extra.id}`, { method: "DELETE" })
}

const latest = await api<Release>(`/repos/${owner}/${repo}/releases/latest`)
const names = latest.assets.map((asset) => asset.name)
console.log(`latest=${latest.tag_name} assets=${names.join(",")}`)
if (latest.tag_name === tag && !names.includes("latest.yml")) {
  throw new Error(`Release ${tag} is latest but missing latest.yml — auto-update will fail`)
}

console.log(`consolidated ${tag}`)
