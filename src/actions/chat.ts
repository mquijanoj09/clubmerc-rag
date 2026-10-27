"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { assertUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { fail, ok, type ActionResult } from "@/actions/result"

export async function deleteConversation(id: string): Promise<ActionResult> {
  try {
    await assertUser()
    const supabase = await createClient()
    // RLS garantiza que solo se elimine una conversación propia.
    const { error } = await supabase.from("conversations").delete().eq("id", z.uuid().parse(id))
    if (error) throw error
    revalidatePath("/chat", "layout")
    return ok(undefined)
  } catch (err) {
    return fail(err, "No se pudo eliminar la conversación.")
  }
}

export async function renameConversation(id: string, title: string): Promise<ActionResult> {
  try {
    await assertUser()
    const parsed = z.object({ id: z.uuid(), title: z.string().trim().min(1).max(80) }).parse({ id, title })
    const supabase = await createClient()
    const { error } = await supabase.from("conversations").update({ title: parsed.title }).eq("id", parsed.id)
    if (error) throw error
    revalidatePath("/chat", "layout")
    return ok(undefined)
  } catch (err) {
    return fail(err, "No se pudo renombrar la conversación.")
  }
}

const requestSchema = z.object({
  requested: z.coerce.number().int().min(1, "Solicita al menos 1 pregunta.").max(500, "El máximo es 500 preguntas."),
  reason: z.string().trim().max(500, "El motivo es demasiado largo.").optional(),
})

export async function createQuestionRequest(input: { requested: number; reason?: string }): Promise<ActionResult> {
  try {
    const user = await assertUser()
    const parsed = requestSchema.safeParse(input)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const db = createAdminClient()
    const { count } = await db
      .from("question_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending")
    if ((count ?? 0) > 0) {
      return { ok: false, error: "Ya tienes una solicitud pendiente. Espera a que el administrador la revise." }
    }

    const { error } = await db.from("question_requests").insert({
      user_id: user.id,
      requested: parsed.data.requested,
      reason: parsed.data.reason || null,
    })
    if (error) throw error
    revalidatePath("/chat", "layout")
    return ok(undefined)
  } catch (err) {
    return fail(err, "No se pudo enviar la solicitud.")
  }
}
