import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Quota } from "@/lib/types"

export type Reservation =
  | { status: "ok"; bucket: "free" | "bonus"; period: string }
  | { status: "no_quota" | "global_limit" | "no_profile" }

/** Descuenta una pregunta de forma atómica (bloqueo de filas en PostgreSQL). */
export async function reserveQuestion(userId: string): Promise<Reservation> {
  const { data, error } = await createAdminClient().rpc("reserve_question", { p_user: userId })
  if (error) throw new Error(`No se pudo reservar la pregunta: ${error.message}`)
  return data as Reservation
}

/** Devuelve la pregunta cuando la respuesta no fue válida. */
export async function refundQuestion(userId: string, reservation: Reservation): Promise<void> {
  if (reservation.status !== "ok") return
  const { error } = await createAdminClient().rpc("refund_question", {
    p_user: userId,
    p_bucket: reservation.bucket,
    p_period: reservation.period,
  })
  if (error) console.error("No se pudo devolver la pregunta:", error.message)
}

export async function getQuota(userId: string): Promise<Quota | null> {
  const { data, error } = await createAdminClient().rpc("get_quota", { p_user: userId })
  if (error) {
    console.error("No se pudo obtener la cuota:", error.message)
    return null
  }
  return data as Quota | null
}

const RATE_LIMIT = { perMinute: 6, perHour: 60 }

/**
 * Límite básico de frecuencia basado en los mensajes guardados del usuario.
 * Aplica a todas las consultas, consuman o no preguntas.
 */
export async function isRateLimited(userId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const count = async (ms: number) => {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user")
      .gte("created_at", new Date(Date.now() - ms).toISOString())
    return count ?? 0
  }
  const [minute, hour] = await Promise.all([count(60_000), count(3_600_000)])
  return minute >= RATE_LIMIT.perMinute || hour >= RATE_LIMIT.perHour
}
