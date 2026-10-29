import "server-only"
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions"
import { getSettings } from "@/lib/assistant/settings"
import {
  NO_INFO_MARKER,
  OFF_TOPIC_MARKER,
  buildClassifierPrompt,
  buildContextMessage,
  buildSystemPrompt,
  checkCitations,
  type ContextChunk,
} from "@/lib/assistant/prompt"
import { embed, getOpenAI } from "@/lib/openai/client"
import { EMBEDDING_MODEL, chatCost, embeddingCost } from "@/lib/openai/pricing"
import { getMonthUsage, logUsage } from "@/lib/openai/usage"
import { getQuota, isRateLimited, refundQuestion, reserveQuestion, type Reservation } from "@/lib/quota/quota"
import { searchChunks, type RetrievedChunk } from "@/lib/rag/retrieve"
import { estimateTokens } from "@/lib/rag/tokens"
import { createAdminClient } from "@/lib/supabase/admin"
import type { AssistantSettings, ChatMessage, ChatStreamEvent, MessageStatus, Source } from "@/lib/types"

const HISTORY_MESSAGES = 6
const HISTORY_MESSAGE_CHARS = 1500
const CLASSIFIER_MAX_TOKENS = 200

type Emit = (event: ChatStreamEvent) => void

export class ChatError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
  }
}

interface HistoryItem {
  role: "user" | "assistant"
  content: string
}

/** Estimación conservadora del costo máximo de una consulta completa. */
function worstCaseCost(s: AssistantSettings): number {
  const classify = chatCost(s.chat_model, 2500, CLASSIFIER_MAX_TOKENS)
  const answer = chatCost(s.chat_model, s.max_input_tokens, s.max_output_tokens)
  return classify + answer + embeddingCost(1000)
}

async function classify(
  s: AssistantSettings,
  userId: string,
  history: HistoryItem[],
  question: string
): Promise<{ category: "on_topic" | "off_topic" | "greeting"; searchQuery: string }> {
  const transcript = history
    .slice(-4)
    .map((m) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.content.slice(0, 500)}`)
    .join("\n")

  const res = await (await getOpenAI()).chat.completions.create({
    model: s.chat_model,
    temperature: 0,
    max_completion_tokens: CLASSIFIER_MAX_TOKENS,
    messages: [
      { role: "system", content: buildClassifierPrompt(s) },
      {
        role: "user",
        content: `${transcript ? `Conversación previa:\n${transcript}\n\n` : ""}Último mensaje del usuario:\n"""${question}"""`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "clasificacion",
        strict: true,
        schema: {
          type: "object",
          properties: {
            category: { type: "string", enum: ["on_topic", "off_topic", "greeting"] },
            search_query: { type: "string" },
          },
          required: ["category", "search_query"],
          additionalProperties: false,
        },
      },
    },
  })

  const usage = res.usage
  await logUsage({
    userId,
    kind: "classify",
    model: s.chat_model,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    costUsd: chatCost(s.chat_model, usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0),
  })

  try {
    const parsed = JSON.parse(res.choices[0]?.message.content ?? "{}")
    const category = ["on_topic", "off_topic", "greeting"].includes(parsed.category) ? parsed.category : "on_topic"
    const searchQuery = typeof parsed.search_query === "string" && parsed.search_query.trim() ? parsed.search_query : question
    return { category, searchQuery }
  } catch {
    // Si la clasificación falla, se continúa: el umbral y el System Prompt siguen protegiendo.
    return { category: "on_topic", searchQuery: question }
  }
}

/**
 * Ajusta fragmentos e historial al máximo de tokens de entrada configurado.
 * El cálculo incluye instrucciones, documentos, historial y pregunta.
 */
function fitToBudget(
  s: AssistantSettings,
  systemPrompt: string,
  question: string,
  chunks: RetrievedChunk[],
  history: HistoryItem[]
): { context: ContextChunk[]; used: RetrievedChunk[]; history: HistoryItem[] } {
  const OVERHEAD = 40
  let remaining = s.max_input_tokens - estimateTokens(systemPrompt) - estimateTokens(question) - 150
  if (remaining < 200) {
    throw new ChatError(
      "input_too_large",
      "La pregunta y las instrucciones superan el límite de tokens de entrada configurado."
    )
  }

  const context: ContextChunk[] = []
  const used: RetrievedChunk[] = []
  for (const chunk of chunks) {
    const cost = estimateTokens(chunk.content) + estimateTokens(chunk.document_name) + OVERHEAD
    if (cost > remaining) {
      if (context.length === 0) {
        // Al menos un fragmento, recortado si es necesario.
        const content = chunk.content.slice(0, Math.max(0, (remaining - OVERHEAD) * 3))
        context.push({ index: 1, documentName: chunk.document_name, content })
        used.push(chunk)
        remaining = 0
      }
      break
    }
    context.push({ index: context.length + 1, documentName: chunk.document_name, content: chunk.content })
    used.push(chunk)
    remaining -= cost
  }

  const keptHistory: HistoryItem[] = []
  for (const item of [...history].reverse()) {
    const cost = estimateTokens(item.content) + 10
    if (cost > remaining) break
    keptHistory.unshift(item)
    remaining -= cost
  }

  return { context, used, history: keptHistory }
}

function toSources(used: RetrievedChunk[], cited: number[]): Source[] {
  const indexes = cited.length > 0 ? cited : used.map((_, i) => i + 1)
  return indexes.map((index) => {
    const chunk = used[index - 1]
    const excerpt = chunk.content
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\s+/g, " ")
      .trim()
    return {
      index,
      document_id: chunk.document_id,
      document_name: chunk.document_name,
      excerpt: excerpt.length > 320 ? `${excerpt.slice(0, 320)}…` : excerpt,
      similarity: Math.round(chunk.similarity * 100) / 100,
    }
  })
}

export async function runChat(params: {
  userId: string
  conversationId: string | null
  question: string
  emit: Emit
}): Promise<void> {
  const { userId, question, emit } = params
  const db = createAdminClient()
  const s = await getSettings()

  // 1. Límites que no consumen preguntas: frecuencia y presupuesto.
  if (await isRateLimited(userId)) {
    throw new ChatError("rate_limited", "Estás enviando mensajes muy rápido. Espera un momento e inténtalo de nuevo.")
  }
  const month = await getMonthUsage()
  if (month.costUsd + worstCaseCost(s) > s.monthly_budget_usd) {
    throw new ChatError(
      "budget_exceeded",
      "El asistente alcanzó el presupuesto mensual configurado. Inténtalo de nuevo el próximo mes."
    )
  }

  // 2. Conversación (verificando que pertenece al usuario).
  let conversationId = params.conversationId
  if (conversationId) {
    const { data } = await db.from("conversations").select("id").eq("id", conversationId).eq("user_id", userId).maybeSingle()
    if (!data) throw new ChatError("not_found", "La conversación no existe.")
  }

  // 3. Reserva atómica de la pregunta (se devuelve si la respuesta no es válida).
  const reservation: Reservation = await reserveQuestion(userId)
  if (reservation.status === "no_quota") {
    throw new ChatError("no_quota", "Has utilizado todas tus preguntas disponibles este mes.")
  }
  if (reservation.status === "global_limit") {
    throw new ChatError("global_limit", "El asistente alcanzó el límite global de preguntas de este mes.")
  }
  if (reservation.status !== "ok") throw new ChatError("no_profile", "No se encontró tu perfil de usuario.")

  let refunded = false
  const refund = async () => {
    if (refunded) return
    refunded = true
    await refundQuestion(userId, reservation)
  }

  try {
    if (!conversationId) {
      const title = question.replace(/\s+/g, " ").trim().slice(0, 60)
      const { data, error } = await db.from("conversations").insert({ user_id: userId, title }).select("id").single()
      if (error || !data) throw new Error("No se pudo crear la conversación.")
      conversationId = data.id as string
    }

    const { data: historyRows } = await db
      .from("messages")
      .select("role, content, status")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_MESSAGES)
    const history: HistoryItem[] = (historyRows ?? [])
      .reverse()
      .filter((m) => m.role === "user" || m.status === "answered")
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, HISTORY_MESSAGE_CHARS) }))

    const { data: userMessage, error: userMessageError } = await db
      .from("messages")
      .insert({ conversation_id: conversationId, user_id: userId, role: "user", content: question })
      .select("id")
      .single()
    if (userMessageError || !userMessage) throw new Error("No se pudo guardar el mensaje.")
    emit({ type: "meta", conversationId, userMessageId: userMessage.id })

    const finish = async (content: string, status: MessageStatus | null, sources: Source[] = []) => {
      const { data, error } = await db
        .from("messages")
        .insert({ conversation_id: conversationId, user_id: userId, role: "assistant", content, status, sources })
        .select("id, role, content, status, sources, created_at")
        .single()
      if (error || !data) throw new Error("No se pudo guardar la respuesta.")
      await db.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId)
      emit({ type: "done", message: data as ChatMessage, quota: await getQuota(userId) })
    }

    // 4. Filtro de tema.
    const { category, searchQuery } = await classify(s, userId, history, question)
    if (category === "greeting") {
      await refund()
      return finish(s.welcome_message, null)
    }
    if (category === "off_topic") {
      await refund()
      return finish(s.off_topic_message, "off_topic")
    }

    // 5. Recuperación: siempre se consulta la documentación desde el backend.
    const { vectors, tokens } = await embed([searchQuery])
    await logUsage({
      userId,
      kind: "embedding_query",
      model: EMBEDDING_MODEL,
      inputTokens: tokens,
      costUsd: embeddingCost(tokens),
    })
    const chunks = await searchChunks(vectors[0], s.max_chunks, s.similarity_threshold)

    // 6. Sin información suficiente: no se llama al modelo ni se consume la pregunta.
    if (chunks.length === 0) {
      await refund()
      return finish(s.unknown_message, "no_info")
    }

    // 7. Prompt restringido al contexto recuperado, dentro del límite de entrada.
    const systemPrompt = buildSystemPrompt(s)
    const fitted = fitToBudget(s, systemPrompt, question, chunks, history)
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "system", content: buildContextMessage(fitted.context) },
      ...fitted.history.map((m) => ({ role: m.role, content: m.content }) as ChatCompletionMessageParam),
      { role: "user", content: question },
    ]

    const stream = await (await getOpenAI()).chat.completions.create({
      model: s.chat_model,
      temperature: 0.2,
      max_completion_tokens: s.max_output_tokens,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    })

    // Se retienen los primeros caracteres para detectar los marcadores antes de mostrarlos.
    let answer = ""
    let decided = false
    let isMarker = false
    let inputTokens = 0
    let outputTokens = 0
    const maxMarker = Math.max(NO_INFO_MARKER.length, OFF_TOPIC_MARKER.length)

    for await (const chunk of stream) {
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens
        outputTokens = chunk.usage.completion_tokens
      }
      const delta = chunk.choices[0]?.delta?.content
      if (!delta) continue
      answer += delta

      if (!decided) {
        const head = answer.trimStart()
        if (head.length >= maxMarker || !head.startsWith("[")) {
          decided = true
          isMarker = head.startsWith(NO_INFO_MARKER) || head.startsWith(OFF_TOPIC_MARKER)
          if (!isMarker) emit({ type: "delta", text: answer })
        }
      } else if (!isMarker) {
        emit({ type: "delta", text: delta })
      }
    }

    await logUsage({
      userId,
      kind: "chat",
      model: s.chat_model,
      inputTokens,
      outputTokens,
      costUsd: chatCost(s.chat_model, inputTokens, outputTokens),
    })

    const trimmed = answer.trim()
    if (!trimmed || trimmed.startsWith(NO_INFO_MARKER)) {
      await refund()
      return finish(s.unknown_message, "no_info")
    }
    if (trimmed.startsWith(OFF_TOPIC_MARKER)) {
      await refund()
      return finish(s.off_topic_message, "off_topic")
    }

    // 8. Comprobación básica de fuentes: se descartan citas inexistentes.
    const cleaned = trimmed.replaceAll(NO_INFO_MARKER, "").replaceAll(OFF_TOPIC_MARKER, "").trim()
    const { text, cited } = checkCitations(cleaned, fitted.used.length)
    return finish(text, "answered", toSources(fitted.used, cited))
  } catch (err) {
    await refund()
    if (conversationId) {
      await db.from("messages").insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "assistant",
        content: "No se pudo generar la respuesta por un error técnico. Esta consulta no consumió preguntas.",
        status: "error",
      })
    }
    throw err
  }
}
