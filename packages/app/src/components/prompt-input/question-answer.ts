import type { QuestionAnswer, QuestionInfo, QuestionRequest } from "@opencode-ai/sdk/v2"

export function parseQuestionAnswers(request: QuestionRequest, text: string): QuestionAnswer[] {
  const questions = request.questions
  const trimmed = text.trim()
  if (questions.length === 0) return []
  if (questions.length === 1) return [parseQuestionAnswer(questions[0], trimmed)]

  const numbered = [...trimmed.matchAll(/^\s*(\d+)\s*[.)、:：]\s*(.+)$/gm)]
  if (numbered.length >= questions.length) {
    const byIndex = new Map(numbered.map((match) => [Number(match[1]) - 1, match[2].trim()]))
    return questions.map((question, index) => parseQuestionAnswer(question, byIndex.get(index) ?? ""))
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+\s*[.)、:：]\s*/, "").trim())
    .filter(Boolean)
  if (lines.length === questions.length) {
    return questions.map((question, index) => parseQuestionAnswer(question, lines[index] ?? ""))
  }

  return questions.map((question, index) => (index === 0 ? parseQuestionAnswer(question, trimmed) : []))
}

function parseQuestionAnswer(question: QuestionInfo, text: string): string[] {
  const options = question.options ?? []
  const raw = text.trim()
  if (!raw) return []

  if (question.multiple) {
    const parts = raw.split(/[,，、/;；\s]+/).filter(Boolean)
    const labels: string[] = []
    for (const part of parts) {
      const matched = matchOptionLabel(options, part)
      const value = matched ?? (question.custom !== false ? part : undefined)
      if (value && !labels.includes(value)) labels.push(value)
    }
    return labels
  }

  const matched = matchOptionLabel(options, raw)
  if (matched) return [matched]
  if (question.custom !== false) return [raw]
  return []
}

function matchOptionLabel(options: QuestionInfo["options"], input: string): string | undefined {
  const value = input.trim()
  if (!value) return undefined

  const letter = value.length === 1 ? value.toUpperCase() : value.match(/^([a-zA-Z])[.)、:：]$/)?.[1]?.toUpperCase()
  if (letter && letter.length === 1) {
    const index = letter.charCodeAt(0) - 65
    const option = options[index]
    if (option && index >= 0) return option.label
  }

  const exact = options.find((option) => option.label.toLowerCase() === value.toLowerCase())
  return exact?.label
}
