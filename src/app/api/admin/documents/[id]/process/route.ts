import { AuthError, assertAdmin } from "@/lib/auth"
import { ingestDocument } from "@/lib/rag/ingest"

// La extracción y los embeddings de documentos pequeños caben en una función de Vercel.
export const maxDuration = 60

export async function POST(_request: Request, ctx: RouteContext<"/api/admin/documents/[id]/process">) {
  let adminId: string
  try {
    adminId = (await assertAdmin()).id
  } catch (err) {
    return Response.json({ error: "No autorizado." }, { status: err instanceof AuthError ? err.status : 401 })
  }

  const { id } = await ctx.params
  try {
    await ingestDocument(id, adminId)
    return Response.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo procesar el documento."
    return Response.json({ error: message }, { status: 422 })
  }
}
