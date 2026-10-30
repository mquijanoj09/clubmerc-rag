import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"

/**
 * Sale de una sesión que el proxy da por válida (token sin expirar) pero que
 * Supabase ya cerró, o de una cuenta sin perfil. Sin esto, /chat y /login se
 * redirigirían entre sí hasta que expire el token. Solo cierra la sesión si
 * realmente no es válida, así que un enlace a esta ruta no desconecta a nadie.
 */
export async function GET(request: Request) {
  if (await getCurrentUser()) return NextResponse.redirect(new URL("/chat", request.url))

  const supabase = await createClient()
  await supabase.auth.signOut({ scope: "local" })
  return NextResponse.redirect(new URL("/login", request.url))
}
