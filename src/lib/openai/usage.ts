import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

export type UsageKind = "chat" | "classify" | "embedding_query" | "embedding_document"

export async function logUsage(entry: {
  userId: string | null
  kind: UsageKind
  model: string
  inputTokens: number
  outputTokens?: number
  costUsd: number
}) {
  const { error } = await createAdminClient().from("openai_usage").insert({
    user_id: entry.userId,
    kind: entry.kind,
    model: entry.model,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens ?? 0,
    cost_usd: entry.costUsd,
  })
  if (error) console.error("No se pudo registrar el consumo de OpenAI:", error.message)
}

function monthStartIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/** Totales del mes en curso (UTC). */
export async function getMonthUsage(): Promise<{ costUsd: number; inputTokens: number; outputTokens: number }> {
  const { data, error } = await createAdminClient()
    .from("openai_usage")
    .select("cost_usd, input_tokens, output_tokens")
    .gte("created_at", monthStartIso())
  if (error) throw new Error(error.message)

  return (data ?? []).reduce(
    (acc, row) => ({
      costUsd: acc.costUsd + Number(row.cost_usd),
      inputTokens: acc.inputTokens + row.input_tokens,
      outputTokens: acc.outputTokens + row.output_tokens,
    }),
    { costUsd: 0, inputTokens: 0, outputTokens: 0 }
  )
}
