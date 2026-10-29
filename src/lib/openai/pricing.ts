/**
 * Precios aproximados en USD por millón de tokens (consultar
 * https://openai.com/api/pricing y actualizar si cambian).
 */
export const CHAT_MODELS = {
  "gpt-4.1-mini": { label: "GPT-4.1 mini", input: 0.4, output: 1.6 },
  "gpt-4o-mini": { label: "GPT-4o mini (más económico)", input: 0.15, output: 0.6 },
  "gpt-4.1": { label: "GPT-4.1 (más preciso, más costoso)", input: 2, output: 8 },
} as const

export type ChatModel = keyof typeof CHAT_MODELS

export const EMBEDDING_MODEL = "text-embedding-3-small"
export const EMBEDDING_DIMENSIONS = 1536
const EMBEDDING_PRICE = 0.02

export function isChatModel(model: string): model is ChatModel {
  return model in CHAT_MODELS
}

export function chatCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = isChatModel(model) ? CHAT_MODELS[model] : CHAT_MODELS["gpt-4.1"]
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000
}

export function embeddingCost(tokens: number): number {
  return (tokens * EMBEDDING_PRICE) / 1_000_000
}
