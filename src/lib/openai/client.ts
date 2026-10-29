import "server-only"
import OpenAI from "openai"
import { openaiApiKey } from "@/lib/env"
import { getSecret } from "@/lib/secrets"
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/lib/openai/pricing"

let client: { apiKey: string; instance: OpenAI } | null = null

/** Clave configurada en el panel; si no hay ninguna, la variable de entorno OPENAI_API_KEY. */
export async function resolveOpenAIKey(): Promise<{ key: string; source: "panel" | "env" }> {
  const stored = await getSecret("openai_api_key")
  if (stored) return { key: stored, source: "panel" }
  return { key: openaiApiKey(), source: "env" }
}

export async function getOpenAI(): Promise<OpenAI> {
  const { key } = await resolveOpenAIKey()
  if (!client || client.apiKey !== key) {
    client = { apiKey: key, instance: new OpenAI({ apiKey: key, maxRetries: 2, timeout: 45_000 }) }
  }
  return client.instance
}

/** Genera embeddings en lotes. Devuelve los vectores en el mismo orden y los tokens usados. */
export async function embed(inputs: string[]): Promise<{ vectors: number[][]; tokens: number }> {
  const openai = await getOpenAI()
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
