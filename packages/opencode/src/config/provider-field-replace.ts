import { isRecord } from "@/util/record"

const PROVIDER_REPLACE_FIELDS = ["models", "options", "env"] as const

/** mergeDeep/patchJsonc keep removed model/option keys; replace those fields when the patch sets them. */
export function applyProviderFieldReplace(merged: unknown, patch: unknown): unknown {
  if (!isRecord(merged) || !isRecord(patch)) return merged
  const patchProvider = patch.provider
  const mergedProvider = merged.provider
  if (!isRecord(patchProvider) || !isRecord(mergedProvider)) return merged

  const provider = { ...mergedProvider }
  let changed = false
  for (const [id, value] of Object.entries(patchProvider)) {
    if (!isRecord(value)) continue
    const target = provider[id]
    if (!isRecord(target)) continue
    const next = { ...target }
    let local = false
    for (const field of PROVIDER_REPLACE_FIELDS) {
      if (!(field in value)) continue
      next[field] = value[field]
      local = true
    }
    if (!local) continue
    provider[id] = next
    changed = true
  }
  if (!changed) return merged
  return { ...merged, provider }
}

export function providerReplaceFields(patch: unknown): Array<{ id: string; field: string; value: unknown }> {
  if (!isRecord(patch) || !isRecord(patch.provider)) return []
  const out: Array<{ id: string; field: string; value: unknown }> = []
  for (const [id, value] of Object.entries(patch.provider)) {
    if (!isRecord(value)) continue
    for (const field of PROVIDER_REPLACE_FIELDS) {
      if (!(field in value)) continue
      out.push({ id, field, value: value[field] })
    }
  }
  return out
}
