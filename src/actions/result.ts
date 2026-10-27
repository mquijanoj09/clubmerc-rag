import { AuthError } from "@/lib/auth"

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string }

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

/** Convierte un error en un mensaje seguro para el usuario (sin detalles internos). */
export function fail(err: unknown, fallback = "Ocurrió un error inesperado."): { ok: false; error: string } {
  if (err instanceof AuthError) return { ok: false, error: err.message }
  console.error(err)
  return { ok: false, error: fallback }
}
