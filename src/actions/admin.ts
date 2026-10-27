"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { assertAdmin } from "@/lib/auth"
import { isChatModel } from "@/lib/openai/pricing"
import { MAX_FILE_BYTES, SUPPORTED_TYPES, fileExtension } from "@/lib/rag/extract"
import { createAdminClient } from "@/lib/supabase/admin"
import { fail, ok, type ActionResult } from "@/actions/result"

const text = (max: number) => z.string().trim().max(max)

const settingsSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(60),
  description: text(500),
  topic: z.string().trim().min(1, "El tema principal es obligatorio.").max(200),
  welcome_message: text(500),
  suggested_questions: z.array(z.string().trim().min(1).max(150)).max(6),
  tone: z.enum(["formal", "profesional", "amigable", "educativo", "tecnico", "casual"]),
  communication_style: text(1000),
  response_length: z.enum(["corta", "media", "detallada"]),
  custom_instructions: text(4000),
  allowed_topics: text(1000),
  rules: text(4000),
  procedures: text(6000),
  unknown_message: z.string().trim().min(1).max(500),
  off_topic_message: z.string().trim().min(1).max(500),
  similarity_threshold: z.coerce.number().min(0).max(1),
})

const limitsSchema = z.object({
  chat_model: z.string().refine(isChatModel, "Modelo no válido."),
  monthly_free_questions: z.coerce.number().int().min(0).max(10000),
  max_output_tokens: z.coerce.number().int().min(50).max(4000),
  max_input_tokens: z.coerce.number().int().min(1000).max(30000),
  max_chunks: z.coerce.number().int().min(1).max(20),
  global_monthly_limit: z.coerce.number().int().min(0).max(1_000_000),
  monthly_budget_usd: z.coerce.number().min(0).max(10000),
})

async function saveSettings(values: Record<string, unknown>) {
  const { error } = await createAdminClient()
    .from("assistant_settings")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", 1)
  if (error) throw error
  revalidatePath("/", "layout")
}

export async function updateAssistantSettings(input: z.input<typeof settingsSchema>): Promise<ActionResult> {
  try {
    await assertAdmin()
    const parsed = settingsSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
    await saveSettings(parsed.data)
    return ok(undefined)
  } catch (err) {
    return fail(err, "No se pudo guardar la configuración.")
  }
}

export async function updateLimits(input: z.input<typeof limitsSchema>): Promise<ActionResult> {
  try {
    await assertAdmin()
    const parsed = limitsSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
    await saveSettings(parsed.data)
    return ok(undefined)
  } catch (err) {
    return fail(err, "No se pudieron guardar los límites.")
  }
}

/**
 * Registra el documento y devuelve una URL firmada para que el navegador lo
 * suba directamente a Storage (evita el límite de tamaño de las funciones de Vercel).
 */
export async function createDocumentUpload(input: {
  name: string
  size: number
}): Promise<ActionResult<{ documentId: string; path: string; token: string }>> {
  try {
    const admin = await assertAdmin()
    const name = z.string().trim().min(1).max(200).parse(input.name)
    const ext = fileExtension(name)
    const mime = SUPPORTED_TYPES[ext]
    if (!mime) return { ok: false, error: "Formato no soportado. Usa PDF, DOCX, TXT o Markdown." }
    if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, error: "El archivo está vacío." }
    if (input.size > MAX_FILE_BYTES) return { ok: false, error: "El archivo supera el máximo de 10 MB." }

    const db = createAdminClient()
    const safeName = name.normalize("NFD").replace(/[^\w.\-]+/g, "_").slice(-100)
    const path = `${crypto.randomUUID()}/${safeName}`

    const { data: upload, error: uploadError } = await db.storage.from("documents").createSignedUploadUrl(path)
    if (uploadError || !upload) throw uploadError ?? new Error("Sin URL de subida")

    const { data: doc, error } = await db
      .from("documents")
      .insert({ name, storage_path: path, mime_type: mime, size_bytes: input.size, uploaded_by: admin.id })
      .select("id")
      .single()
    if (error || !doc) throw error ?? new Error("Sin documento")

    return ok({ documentId: doc.id as string, path, token: upload.token })
  } catch (err) {
    return fail(err, "No se pudo preparar la subida del documento.")
  }
}

export async function deleteDocument(id: string): Promise<ActionResult> {
  try {
    await assertAdmin()
    const db = createAdminClient()
    const { data: doc } = await db.from("documents").select("storage_path").eq("id", z.uuid().parse(id)).single()
    if (!doc) return { ok: false, error: "El documento no existe." }
    await db.storage.from("documents").remove([doc.storage_path])
    const { error } = await db.from("documents").delete().eq("id", id)
    if (error) throw error
    revalidatePath("/admin", "layout")
    return ok(undefined)
  } catch (err) {
    return fail(err, "No se pudo eliminar el documento.")
  }
}

export async function grantQuestions(userId: string, amount: number): Promise<ActionResult> {
  try {
    await assertAdmin()
    const parsed = z
      .object({ userId: z.uuid(), amount: z.coerce.number().int().min(1, "Mínimo 1.").max(1000, "Máximo 1000.") })
      .safeParse({ userId, amount })
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
    const { error } = await createAdminClient().rpc("grant_bonus", {
      p_user: parsed.data.userId,
      p_amount: parsed.data.amount,
    })
    if (error) throw error
    revalidatePath("/admin", "layout")
    return ok(undefined)
  } catch (err) {
    return fail(err, "No se pudieron conceder las preguntas.")
  }
}

export async function reviewRequest(requestId: string, approve: boolean, granted?: number): Promise<ActionResult> {
  try {
    const admin = await assertAdmin()
    const parsed = z
      .object({ requestId: z.uuid(), granted: z.coerce.number().int().min(1, "Mínimo 1.").max(1000, "Máximo 1000.").optional() })
      .safeParse({ requestId, granted: approve ? granted : undefined })
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const { error } = await createAdminClient().rpc("review_request", {
      p_request: parsed.data.requestId,
      p_approve: approve,
      p_granted: approve ? parsed.data.granted : null,
      p_admin: admin.id,
    })
    if (error) {
      if (error.message.includes("ALREADY_REVIEWED")) {
        return { ok: false, error: "Esta solicitud ya fue revisada." }
      }
      throw error
    }
    revalidatePath("/admin", "layout")
    return ok(undefined)
  } catch (err) {
    return fail(err, "No se pudo actualizar la solicitud.")
  }
}
