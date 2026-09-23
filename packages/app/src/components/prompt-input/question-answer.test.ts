import { describe, expect, test } from "bun:test"
import type { QuestionRequest } from "@opencode-ai/sdk/v2"
import { parseQuestionAnswers } from "./question-answer"

const request = (questions: QuestionRequest["questions"]): QuestionRequest => ({
  id: "que_1",
  sessionID: "ses_1",
  questions,
})

const single = {
  question: "Pick a color",
  header: "Color",
  options: [
    { label: "Red", description: "warm" },
    { label: "Green", description: "cool" },
    { label: "Blue", description: "cold" },
  ],
}

describe("parseQuestionAnswers", () => {
  test("maps letters to option labels", () => {
    expect(parseQuestionAnswers(request([single]), "B")).toEqual([["Green"]])
    expect(parseQuestionAnswers(request([single]), "a")).toEqual([["Red"]])
    expect(parseQuestionAnswers(request([single]), "C.")).toEqual([["Blue"]])
  })

  test("accepts exact option labels", () => {
    expect(parseQuestionAnswers(request([single]), "blue")).toEqual([["Blue"]])
  })

  test("keeps custom text when allowed", () => {
    expect(parseQuestionAnswers(request([single]), "purple")).toEqual([["purple"]])
  })

  test("drops unmatched text when custom is disabled", () => {
    const noCustom = { ...single, custom: false }
    expect(parseQuestionAnswers(request([noCustom]), "purple")).toEqual([[]])
    expect(parseQuestionAnswers(request([noCustom]), "A")).toEqual([["Red"]])
  })

  test("splits multiple answers for multi-select", () => {
    const multi = { ...single, multiple: true }
    expect(parseQuestionAnswers(request([multi]), "A, C")).toEqual([["Red", "Blue"]])
    expect(parseQuestionAnswers(request([multi]), "A、B")).toEqual([["Red", "Green"]])
  })

  test("parses numbered multi-question answers", () => {
    const second = {
      question: "Pick a size",
      header: "Size",
      options: [
        { label: "S", description: "" },
        { label: "M", description: "" },
      ],
    }
    expect(parseQuestionAnswers(request([single, second]), "1) B\n2. A")).toEqual([["Green"], ["S"]])
  })

  test("falls back to first question for unsegmented multi-question text", () => {
    const second = { ...single, question: "Second" }
    expect(parseQuestionAnswers(request([single, second]), "A")).toEqual([["Red"], []])
  })
})
