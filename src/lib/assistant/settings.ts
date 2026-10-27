import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import type { AssistantSettings, PublicAssistantInfo } from "@/lib/types"

/** Se lee en cada solicitud: los cambios del panel aplican de inmediato. */
export async function getSettings(): Promise<AssistantSettings> {
  const { data, error } = await createAdminClient().from("assistant_settings").select("*").eq("id", 1).single()
  if (error || !data) throw new Error("No se pudo cargar la configuración del asistente.")
  return { ...data, monthly_budget_usd: Number(data.monthly_budget_usd) } as AssistantSettings
}

export async function getPublicAssistantInfo(): Promise<PublicAssistantInfo> {
  const s = await getSettings()
  return {
    name: s.name,
    description: s.description,
    topic: s.topic,
    welcome_message: s.welcome_message,
    suggested_questions: s.suggested_questions,
  }
}
