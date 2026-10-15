import { describe, expect, test } from "bun:test"
import { mergeDeep } from "remeda"
import { applyProviderFieldReplace } from "./provider-field-replace"

describe("applyProviderFieldReplace", () => {
  test("replaces models so removed keys do not linger after mergeDeep", () => {
    const existing = {
      provider: {
        workbudy: {
          npm: "@ai-sdk/openai-compatible",
          name: "workbudy",
          options: { baseURL: "https://api.example.com/v1", headers: { "X-Old": "1" } },
          models: {
            "cn:old": { name: "Old" },
            "cn:keep": { name: "Keep" },
          },
        },
      },
    }
    const patch = {
      provider: {
        workbudy: {
          npm: "@ai-sdk/openai-compatible",
          name: "workbudy",
          options: { baseURL: "https://api.example.com/v1", headers: {} },
          models: {
            "cn:keep": { name: "Keep" },
            "cn:new": { name: "New" },
          },
          env: [],
        },
      },
    }

    const merged = applyProviderFieldReplace(mergeDeep(existing, patch), patch) as typeof existing

    expect(merged.provider.workbudy.models).toEqual({
      "cn:keep": { name: "Keep" },
      "cn:new": { name: "New" },
    })
    expect(merged.provider.workbudy.options).toEqual({
      baseURL: "https://api.example.com/v1",
      headers: {},
    })
  })
})
