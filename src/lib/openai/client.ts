import "server-only"
import OpenAI from "openai"
import { openaiApiKey } from "@/lib/env"
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/lib/openai/pricing"

let client: OpenAI | null = null

export function getOpenAI(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: openaiApiKey(), maxRetries: 2, timeout: 45_000 })
  return client
}

/** Genera embeddings en lotes. Devuelve los vectores en el mismo orden y los tokens usados. */
export async function embed(inputs: string[]): Promise<{ vectors: number[][]; tokens: number }> {
  const openai = getOpenAI()
  const vectors: number[][] = []
  let tokens = 0
  const BATCH = 96

  for (let i = 0; i < inputs.length; i += BATCH) {
    const res = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: inputs.slice(i, i + BATCH),
      dimensions: EMBEDDING_DIMENSIONS,
    })
    for (const item of res.data.sort((a, b) => a.index - b.index)) vectors.push(item.embedding)
    tokens += res.usage.total_tokens
  }

  return { vectors, tokens }
}
