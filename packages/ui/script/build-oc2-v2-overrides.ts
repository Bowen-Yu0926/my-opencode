#!/usr/bin/env bun

import { V2_PRIMITIVES_DEFAULT } from "../src/theme/v2/default-primitives"
import type { DesktopTheme } from "../src/theme/types"

const themePath = import.meta.dir + "/../src/theme/themes/oc-2.json"
const theme = (await Bun.file(themePath).json()) as DesktopTheme
const css = await Bun.file(import.meta.dir + "/../src/v2/styles/theme.css").text()

// Committed values win over generated defaults. The checked-in theme carries hand-tuned primitives
// (grey/blue ramps) and contrast tweaks that `theme.css` does not describe, so a plain regenerate
// would silently revert them. This script therefore backfills missing tokens only.
const light = { ...V2_PRIMITIVES_DEFAULT, ...readTokens("light"), ...theme.light.v2Overrides }
const dark = { ...V2_PRIMITIVES_DEFAULT, ...readTokens("dark"), ...theme.dark.v2Overrides }

const next: DesktopTheme = {
  ...theme,
  light: { ...theme.light, v2Overrides: light },
  dark: { ...theme.dark, v2Overrides: dark },
}

await Bun.write(themePath, JSON.stringify(next, null, 2) + "\n")
console.log("Updated oc-2.json v2Overrides", Object.keys(light).length, "tokens per mode")

function readTokens(mode: "light" | "dark") {
  const selector = mode === "light" ? ":root" : `\\[data-color-scheme="${mode}"\\]`
  const block = css.match(new RegExp(`${selector} \\{([\\s\\S]*?)\\n  \\}`))?.[1]
  if (!block) throw new Error(`Missing ${mode} OC-2 tokens`)
  return Object.fromEntries(
    [...block.matchAll(/--(v2-[\w-]+):\s*([^;]+);/g)]
      // Fonts and the fixed avatar foreground remain global CSS rather than theme overrides.
      // Agent colors are owned by `v2/mapping.ts` at runtime; `theme.css` only mirrors them for
      // pre-hydration paint, so baking them here would override the richer runtime values.
      .filter(
        ([, key]) =>
          key !== "v2-avatar-fg" && key !== "v2-font-family-sans" && !key.startsWith("v2-agent-"),
      )
      .map(([, key, value]) => [key, value!.replace(/\s+/g, " ").trim()]),
  )
}
