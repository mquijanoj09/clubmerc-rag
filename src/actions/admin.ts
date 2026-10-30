"use server"

import { revalidatePath } from "next/cache"
import OpenAI from "openai"
import { z } from "zod"
import { parseEmailDomains } from "@/lib/assistant/email-domains"
import { assertAdmin } from "@/lib/auth"
import { HEX_COLOR } from "@/lib/color"
import { getOpenAI } from "@/lib/openai/client"
import { isChatModel } from "@/lib/openai/pricing"
import { MAX_FILE_BYTES, SUPPORTED_TYPES, fileExtension } from "@/lib/rag/extract"
import { deleteSecret, setSecret } from "@/lib/secrets"
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

const brandSchema = z.object({
  brand_color: z.string().regex(HEX_COLOR, "El color principal debe tener el formato #rrggbb."),
  brand_accent: z.string().regex(HEX_COLOR, "El color de acento debe tener el formato #rrggbb."),
})

const BRAND_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
}

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

    // OpenAI retira modelos sin quitarlos de /models: se prueba con una llamada mínima.
    // Solo se bloquea si el modelo no existe; otros fallos (saldo, red) no impiden guardar.
    try {
      await (await getOpenAI()).chat.completions.create({
        model: parsed.data.chat_model,
        max_completion_tokens: 1,
        messages: [{ role: "user", content: "ok" }],
      })
    } catch (err) {
      if (err instanceof OpenAI.APIError && (err.status === 404 || err.code === "model_not_found")) {
        return { ok: false, error: "OpenAI ya no ofrece este modelo. Elige otro." }
      }
    }

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

export async function updateBrand(input: z.input<typeof brandSchema>): Promise<ActionResult> {
  try {
    await assertAdmin()
    const parsed = brandSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
    await saveSettings({ brand_color: parsed.data.brand_color.toLowerCase(), brand_accent: parsed.data.brand_accent.toLowerCase() })
    return ok(undefined)
  } catch (err) {
    return fail(err, "No se pudieron guardar los colores.")
  }
}

const BRAND_IMAGES = {
  icon: { column: "icon_url", maxBytes: 512 * 1024 },
  icon_dark: { column: "icon_dark_url", maxBytes: 512 * 1024 },
  logo: { column: "logo_url", maxBytes: 512 * 1024 },
  logo_dark: { column: "logo_dark_url", maxBytes: 512 * 1024 },
  auth_image: { column: "auth_image_url", maxBytes: 5 * 1024 * 1024 },
} as const
export type BrandImage = keyof typeof BRAND_IMAGES
const brandImageKind = z.enum(["icon", "icon_dark", "logo", "logo_dark", "auth_image"])

/** Elimina del bucket el archivo al que apunta una URL pública (si es del bucket de marca). */
async function removeBrandFile(url: string | null) {
  const marker = "/branding/"
  const i = url?.indexOf(marker) ?? -1
  if (!url || i < 0) return
  await createAdminClient().storage.from("branding").remove([decodeURIComponent(url.slice(i + marker.length).split("?")[0])])
}

async function currentBrandUrl(column: string): Promise<string | null> {
  const { data } = await createAdminClient().from("assistant_settings").select(column).eq("id", 1).single()
  return ((data as Record<string, string | null> | null)?.[column] as string | null) ?? null
}

/**
 * Prepara la subida de una imagen de marca. El navegador la sube directamente a
 * Storage con la URL firmada (las fotografías superan el límite de las Server Actions).
 */
export async function createBrandUpload(
  kind: BrandImage,
  input: { type: string; size: number }
): Promise<ActionResult<{ path: string; token: string }>> {
  try {
    await assertAdmin()
    const { maxBytes } = BRAND_IMAGES[brandImageKind.parse(kind)]
    const ext = BRAND_IMAGE_TYPES[input.type]
    if (!ext) return { ok: false, error: "Formato no soportado. Usa PNG, JPG, WebP o SVG." }
    if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, error: "La imagen está vacía." }
    if (input.size > maxBytes) return { ok: false, error: `La imagen supera el máximo de ${maxBytes / 1024 / 1024 >= 1 ? `${maxBytes / 1024 / 1024} MB` : `${maxBytes / 1024} KB`}.` }

    // Nombre nuevo en cada subida: evita que el navegador muestre la imagen anterior en caché.
    const path = `${kind}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`
    const { data, error } = await createAdminClient().storage.from("branding").createSignedUploadUrl(path)
    if (error || !data) throw error ?? new Error("Sin URL de subida")
    return ok({ path, token: data.token })
  } catch (err) {
    return fail(err, "No se pudo preparar la subida de la imagen.")
  }
}

/** Activa una imagen ya subida y borra la anterior. */
export async function commitBrandImage(kind: BrandImage, path: string): Promise<ActionResult<{ url: string }>> {
  try {
    await assertAdmin()
    const { column } = BRAND_IMAGES[brandImageKind.parse(kind)]
    if (!new RegExp(`^${kind}-\\d+-[0-9a-f]{8}\\.(png|jpg|webp|svg)$`).test(path)) {
      return { ok: false, error: "Ruta de imagen no válida." }
    }
    const db = createAdminClient()
    const { data: exists } = await db.storage.from("branding").exists(path)
    if (!exists) return { ok: false, error: "La imagen no se subió correctamente. Inténtalo de nuevo." }

    const previous = await currentBrandUrl(column)
    const url = db.storage.from("branding").getPublicUrl(path).data.publicUrl
    await saveSettings({ [column]: url })
    if (previous !== url) await removeBrandFile(previous)
    return ok({ url })
  } catch (err) {
    return fail(err, "No se pudo guardar la imagen.")
  }
}

export async function removeBrandImage(kind: BrandImage): Promise<ActionResult> {
  try {
    await assertAdmin()
    const { column } = BRAND_IMAGES[brandImageKind.parse(kind)]
    const previous = await currentBrandUrl(column)
    await saveSettings({ [column]: null })
    await removeBrandFile(previous)
    return ok(undefined)
  } catch (err) {
    return fail(err, "No se pudo quitar la imagen.")
  }
}

/** Dominios de correo autorizados a registrarse. Lista vacía = cualquier correo. */
export async function updateAllowedDomains(domains: string[]): Promise<ActionResult<{ domains: string[] }>> {
  try {
    await assertAdmin()
    let parsed: string[]
    try {
      parsed = parseEmailDomains(z.array(z.string().max(100)).max(20, "Máximo 20 dominios.").parse(domains))
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Dominios no válidos." }
    }
    await saveSettings({ allowed_email_domains: parsed })
    return ok({ domains: parsed })
  } catch (err) {
    return fail(err, "No se pudieron guardar los dominios.")
  }
}

export async function saveOpenAIKey(apiKey: string): Promise<ActionResult> {
  try {
    await assertAdmin()
    const parsed = z.string().trim().min(20, "La clave es demasiado corta.").max(300).startsWith("sk-", "La clave debe empezar por «sk-».").safeParse(apiKey)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    // Se comprueba contra OpenAI antes de guardarla (esta llamada no tiene costo).
    try {
      await new OpenAI({ apiKey: parsed.data, maxRetries: 0, timeout: 15_000 }).models.list()
    } catch (err) {
      if (err instanceof OpenAI.AuthenticationError) return { ok: false, error: "OpenAI rechazó la clave. Revísala e inténtalo de nuevo." }
      if (err instanceof OpenAI.PermissionDeniedError) return { ok: false, error: "La clave no tiene permisos para usar la API." }
      return { ok: false, error: "No se pudo verificar la clave con OpenAI. Inténtalo de nuevo." }
    }

    await setSecret("openai_api_key", parsed.data)
    revalidatePath("/admin", "layout")
    return ok(undefined)
  } catch (err) {
    return fail(err, "No se pudo guardar la clave.")
  }
}

/** Quita la clave del panel; la app vuelve a usar OPENAI_API_KEY (si existe). */
export async function removeOpenAIKey(): Promise<ActionResult> {
  try {
    await assertAdmin()
    await deleteSecret("openai_api_key")
    revalidatePath("/admin", "layout")
    return ok(undefined)
  } catch (err) {
    return fail(err, "No se pudo quitar la clave.")
  }
}

/** Mensaje que se muestra a los usuarios en la pantalla de inicio de sesión. */
export async function updateAuthMessage(message: string): Promise<ActionResult> {
  try {
    await assertAdmin()
    const parsed = text(300).safeParse(message)
    if (!parsed.success) return { ok: false, error: "El mensaje admite como máximo 300 caracteres." }
    await saveSettings({ auth_message: parsed.data })
    return ok(undefined)
  } catch (err) {
    return fail(err, "No se pudo guardar el mensaje.")
  }
}
