import { z } from "zod"
import { AuthError, assertUser } from "@/lib/auth"
import { ChatError, runChat } from "@/lib/chat/pipeline"
import { getQuota } from "@/lib/quota/quota"
import type { ChatStreamEvent } from "@/lib/types"

export const maxDuration = 60

const bodySchema = z.object({
  conversationId: z.uuid().nullable(),
  message: z.string().trim().min(1, "Escribe una pregunta.").max(2000, "La pregunta es demasiado larga (máx. 2000 caracteres)."),
})

export async function POST(request: Request) {
  let userId: string
  try {
    userId = (await assertUser()).id
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401
    return Response.json({ error: "Debes iniciar sesión." }, { status })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Solicitud inválida." }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: ChatStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          // El cliente cerró la conexión; el proceso continúa para guardar el resultado.
        }
      }

      try {
        await runChat({ userId, conversationId: parsed.data.conversationId, question: parsed.data.message, emit })
      } catch (err) {
        const known = err instanceof ChatError
        if (!known) console.error("Error en /api/chat:", err)
        emit({
          type: "error",
          code: known ? err.code : "internal",
          message: known ? err.message : "Ocurrió un error técnico al generar la respuesta. No se consumió ninguna pregunta.",
          quota: await getQuota(userId).catch(() => null),
        })
      } finally {
        try {
          controller.close()
        } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}
