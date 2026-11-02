import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import path from "path"
import { fileURLToPath } from "url"
import { Context, Effect, Layer, Schema } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { Config } from "@/config/config"
import { ConfigPlugin } from "@/config/plugin"
import { isRecord } from "@/util/record"
import { internalPluginNames } from "./index"
import { parsePluginSpecifier, pluginSource } from "./shared"

export const Info = Schema.Struct({
  spec: Schema.String,
  name: Schema.String,
  source: Schema.Literals(["file", "npm", "builtin"]),
  scope: Schema.Literals(["global", "local"]),
  bundled: Schema.Boolean,
  description: Schema.optional(Schema.String),
  descriptionOverridden: Schema.optional(Schema.Boolean),
}).annotate({ identifier: "PluginInfo" })
export type Info = Schema.Schema.Type<typeof Info>

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("PluginManage.NotFoundError", {
  spec: Schema.String,
  available: Schema.Array(Schema.String),
}) {
  override get message() {
    return `Plugin "${this.spec}" not found`
  }
}

export class BuiltinError extends Schema.TaggedErrorClass<BuiltinError>()("PluginManage.BuiltinError", {
  spec: Schema.String,
}) {
  override get message() {
    return `Built-in plugin "${this.spec}" cannot be removed`
  }
}

export interface Interface {
  readonly list: () => Effect.Effect<Info[]>
  readonly remove: (spec: string) => Effect.Effect<Info, NotFoundError | BuiltinError>
  readonly setDescription: (spec: string, description: string) => Effect.Effect<Info, NotFoundError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/PluginManage") {}

const pluginDescriptionsFile = (global: Global.Interface) => path.join(global.data, "plugin-descriptions.json")

const readOverrides = Effect.fnUntraced(function* (fsys: FSUtil.Interface, global: Global.Interface) {
  const text = yield* fsys.readFileStringSafe(pluginDescriptionsFile(global)).pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    return isRecord(parsed) ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
})

// When the derived `plugin_origins` metadata is missing (older configs), fall back to the raw
// `plugin` array and treat every entry as global so management still works.
function effectiveOrigins(cfg: {
  plugin?: ConfigPlugin.Origin["spec"][]
  plugin_origins?: ConfigPlugin.Origin[]
}): ConfigPlugin.Origin[] {
  if (cfg.plugin_origins?.length) return cfg.plugin_origins
  return (cfg.plugin ?? []).map((spec) => ({ spec, source: "", scope: "global" as const }))
}

function pluginName(spec: string) {
  if (pluginSource(spec) === "npm") return parsePluginSpecifier(spec).pkg
  return path.basename(fileURLToPath(spec), path.extname(fileURLToPath(spec)))
}

function toInfo(origin: ConfigPlugin.Origin, overrides: Record<string, string>): Info {
  const spec = ConfigPlugin.pluginSpecifier(origin.spec)
  const override = overrides[spec]
  return {
    spec,
    name: pluginName(spec),
    source: pluginSource(spec),
    scope: origin.scope,
    bundled: false,
    ...(override !== undefined ? { description: override, descriptionOverridden: true } : {}),
  }
}

function builtinInfo(name: string, overrides: Record<string, string>): Info {
  const override = overrides[name]
  return {
    spec: name,
    name,
    source: "builtin",
    scope: "global",
    bundled: true,
    ...(override !== undefined ? { description: override, descriptionOverridden: true } : {}),
  }
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const fsys = yield* FSUtil.Service
    const global = yield* Global.Service

    const list = Effect.fn("PluginManage.list")(function* () {
      const cfg = yield* config.get()
      const overrides = yield* readOverrides(fsys, global)
      const builtins = internalPluginNames().map((name) => builtinInfo(name, overrides))
      const user = effectiveOrigins(cfg).map((origin) => toInfo(origin, overrides))
      return [...builtins, ...user]
    })

    const remove = Effect.fn("PluginManage.remove")(function* (spec: string) {
      if (internalPluginNames().includes(spec)) {
        return yield* new BuiltinError({ spec })
      }
      const cfg = yield* config.get()
      const origins = effectiveOrigins(cfg)
      const target = origins.find((origin) => ConfigPlugin.pluginSpecifier(origin.spec) === spec)
      if (!target) {
        return yield* new NotFoundError({ spec, available: origins.map((origin) => ConfigPlugin.pluginSpecifier(origin.spec)) })
      }
      const remaining = origins.filter((origin) => ConfigPlugin.pluginSpecifier(origin.spec) !== spec)
      const next = { ...cfg, plugin: remaining.map((origin) => origin.spec), plugin_origins: remaining }
      if (target.scope === "global") yield* config.updateGlobal(next)
      else yield* config.update(next)
      return toInfo(target, yield* readOverrides(fsys, global))
    })

    const setDescription = Effect.fn("PluginManage.setDescription")(function* (spec: string, description: string) {
      const cfg = yield* config.get()
      const overrides = yield* readOverrides(fsys, global)
      const origins = effectiveOrigins(cfg)
      const isBuiltin = internalPluginNames().includes(spec)
      const target = origins.find((origin) => ConfigPlugin.pluginSpecifier(origin.spec) === spec)
      if (!isBuiltin && !target) {
        return yield* new NotFoundError({ spec, available: origins.map((origin) => ConfigPlugin.pluginSpecifier(origin.spec)) })
      }
      const trimmed = description.trim()
      if (trimmed) overrides[spec] = trimmed
      else delete overrides[spec]
      yield* fsys.writeFileString(pluginDescriptionsFile(global), JSON.stringify(overrides, null, 2)).pipe(Effect.orDie)
      return isBuiltin ? builtinInfo(spec, overrides) : toInfo(target!, overrides)
    })

    return Service.of({ list, remove, setDescription })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Config.node, FSUtil.node, Global.node],
})

export * as PluginManage from "./manage"
