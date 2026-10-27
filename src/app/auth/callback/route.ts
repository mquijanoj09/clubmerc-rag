import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/** Destino del enlace de confirmación de correo de Supabase. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}/chat`)
  }

  return NextResponse.redirect(`${origin}/login?error=confirmacion`)
}
