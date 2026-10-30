import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Profile } from "@/lib/types"

/** Usuario autenticado y su perfil (verificado contra Supabase Auth). */
export const getCurrentUser = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, bonus_balance, bonus_granted_total, created_at")
    .eq("id", user.id)
    .single()

  return (profile as Profile | null) ?? null
})

/** Para páginas: sin sesión válida, limpia las cookies y lleva al login (ver /auth/reset). */
export async function requireUser(): Promise<Profile> {
  const user = await getCurrentUser()
  if (!user) redirect("/auth/reset")
  return user
}

/** Para páginas del panel: redirige al chat si no es administrador. */
export async function requireAdmin(): Promise<Profile> {
  const user = await requireUser()
  if (user.role !== "admin") redirect("/chat")
  return user
}

export class AuthError extends Error {
  constructor(public status: 401 | 403) {
    super(status === 401 ? "Debes iniciar sesión." : "No tienes permisos para esta acción.")
  }
}

/** Para Server Actions y Route Handlers: lanza AuthError en lugar de redirigir. */
export async function assertUser(): Promise<Profile> {
  const user = await getCurrentUser()
  if (!user) throw new AuthError(401)
  return user
}

export async function assertAdmin(): Promise<Profile> {
  const user = await assertUser()
  if (user.role !== "admin") throw new AuthError(403)
  return user
}
