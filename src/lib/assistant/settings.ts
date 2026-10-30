import "server-only"
import { cache } from "react"
import { DEFAULT_BRAND } from "@/lib/color"
import { createAdminClient } from "@/lib/supabase/admin"
import type { AssistantSettings, PublicAssistantInfo } from "@/lib/types"

/** Se lee en cada solicitud (una vez por solicitud): los cambios del panel aplican de inmediato. */
export const getSettings = cache(async (): Promise<AssistantSettings> => {
  const { data, error } = await createAdminClient().from("assistant_settings").select("*").eq("id", 1).single()
  if (error || !data) throw new Error("No se pudo cargar la configuración del asistente.")
  return {
    ...data,
    monthly_budget_usd: Number(data.monthly_budget_usd),
    // Valores por defecto por si aún no se aplicó la migración de marca.
    brand_color: data.brand_color ?? DEFAULT_BRAND.color,
    brand_accent: data.brand_accent ?? DEFAULT_BRAND.accent,
    logo_url: data.logo_url ?? null,
    icon_url: data.icon_url ?? null,
    icon_dark_url: data.icon_dark_url ?? null,
    logo_dark_url: data.logo_dark_url ?? null,
    auth_image_url: data.auth_image_url ?? null,
    auth_message: data.auth_message ?? "",
    allowed_email_domains: data.allowed_email_domains ?? [],
  } as AssistantSettings
})

export async function getPublicAssistantInfo(): Promise<PublicAssistantInfo> {
  const s = await getSettings()
  return {
    name: s.name,
    topic: s.topic,
    welcome_message: s.welcome_message,
    suggested_questions: s.suggested_questions,
    brand_color: s.brand_color,
    brand_accent: s.brand_accent,
    logo_url: s.logo_url,
    icon_url: s.icon_url,
    icon_dark_url: s.icon_dark_url,
    logo_dark_url: s.logo_dark_url,
    auth_image_url: s.auth_image_url,
    auth_message: s.auth_message,
    allowed_email_domains: s.allowed_email_domains,
  }
}
