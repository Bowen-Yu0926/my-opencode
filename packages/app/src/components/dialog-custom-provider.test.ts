import { describe, expect, test } from "bun:test"
import {
  formStateFromCustomProvider,
  isCustomProviderConfig,
  validateCustomProvider,
} from "./dialog-custom-provider-form"

const t = (key: string) => key

describe("validateCustomProvider", () => {
  test("builds trimmed config payload", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: " Custom Provider ",
        baseURL: "https://api.example.com ",
        apiKey: " {env: CUSTOM_PROVIDER_KEY} ",
        models: [{ row: "m0", id: " model-a ", name: " Model A ", err: {} }],
        headers: [
          { row: "h0", key: " X-Test ", value: " enabled ", err: {} },
          { row: "h1", key: "", value: "", err: {} },
        ],
        err: {},
      },
      t,
      disabledProviders: [],
      existingProviderIDs: new Set(),
    })

    expect(result.result).toEqual({
      providerID: "custom-provider",
      name: "Custom Provider",
      key: undefined,
      config: {
        npm: "@ai-sdk/openai-compatible",
        name: "Custom Provider",
        env: ["CUSTOM_PROVIDER_KEY"],
        options: {
          baseURL: "https://api.example.com",
          headers: {
            "X-Test": "enabled",
          },
        },
        models: {
          "model-a": { name: "Model A" },
        },
      },
    })
  })

  test("flags duplicate rows and allows reconnecting disabled providers", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "custom-provider",
        name: "Provider",
        baseURL: "https://api.example.com",
        apiKey: "secret",
        models: [
          { row: "m0", id: "model-a", name: "Model A", err: {} },
          { row: "m1", id: "model-a", name: "Model A 2", err: {} },
        ],
        headers: [
          { row: "h0", key: "Authorization", value: "one", err: {} },
          { row: "h1", key: "authorization", value: "two", err: {} },
        ],
        err: {},
      },
      t,
      disabledProviders: ["custom-provider"],
      existingProviderIDs: new Set(["custom-provider"]),
    })

    expect(result.result).toBeUndefined()
    expect(result.err.providerID).toBeUndefined()
    expect(result.models[1]).toEqual({
      id: "provider.custom.error.duplicate",
      name: undefined,
    })
    expect(result.headers[1]).toEqual({
      key: "provider.custom.error.duplicate",
      value: undefined,
    })
  })

  test("edit mode allows updating an existing provider and its models", () => {
    const result = validateCustomProvider({
      form: {
        providerID: "workbudy",
        name: "workbudy",
        baseURL: "https://api.workbudy.com/v1",
        apiKey: "",
        models: [
          { row: "m0", id: "cn:deepseek-v4-pro", name: "DeepSeek V4 Pro", err: {} },
          { row: "m1", id: "cn:glm-5.3", name: "GLM 5.3", err: {} },
        ],
        headers: [{ row: "h0", key: "", value: "", err: {} }],
        err: {},
      },
      t,
      mode: "edit",
      disabledProviders: [],
      existingProviderIDs: new Set(["workbudy", "openai"]),
    })

    expect(result.err.providerID).toBeUndefined()
    expect(result.result).toEqual({
      providerID: "workbudy",
      name: "workbudy",
      key: undefined,
      config: {
        npm: "@ai-sdk/openai-compatible",
        name: "workbudy",
        options: {
          baseURL: "https://api.workbudy.com/v1",
        },
        models: {
          "cn:deepseek-v4-pro": { name: "DeepSeek V4 Pro" },
          "cn:glm-5.3": { name: "GLM 5.3" },
        },
      },
    })
  })
})

describe("isCustomProviderConfig", () => {
  test("returns true only for openai-compatible providers with models", () => {
    expect(
      isCustomProviderConfig({
        npm: "@ai-sdk/openai-compatible",
        models: { "model-a": { name: "Model A" } },
      }),
    ).toBe(true)
    expect(isCustomProviderConfig({ npm: "@ai-sdk/openai-compatible", models: {} })).toBe(false)
    expect(isCustomProviderConfig({ npm: "@ai-sdk/openai", models: { a: { name: "A" } } })).toBe(false)
    expect(isCustomProviderConfig(undefined)).toBe(false)
  })
})

describe("formStateFromCustomProvider", () => {
  test("hydrates form fields from stored provider config", () => {
    const form = formStateFromCustomProvider("workbudy", {
      npm: "@ai-sdk/openai-compatible",
      name: "WorkBudy",
      env: ["WORKBUDY_KEY"],
      options: {
        baseURL: "https://api.workbudy.com/v1",
        headers: { "X-Org": "acme" },
      },
      models: {
        "cn:deepseek-v4-pro": { name: "DeepSeek V4 Pro" },
        "cn:glm-5.3": { name: "GLM 5.3" },
      },
    })

    expect(form.providerID).toBe("workbudy")
    expect(form.name).toBe("WorkBudy")
    expect(form.baseURL).toBe("https://api.workbudy.com/v1")
    expect(form.apiKey).toBe("{env:WORKBUDY_KEY}")
    expect(form.models.map((m) => ({ id: m.id, name: m.name }))).toEqual([
      { id: "cn:deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      { id: "cn:glm-5.3", name: "GLM 5.3" },
    ])
    expect(form.headers.map((h) => ({ key: h.key, value: h.value }))).toEqual([{ key: "X-Org", value: "acme" }])
  })
})
