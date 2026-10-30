import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const supabase = await createClient()
  // Solo este navegador: cerrar todas las sesiones dejaría las demás pestañas y dispositivos con un token huérfano.
  await supabase.auth.signOut({ scope: "local" })
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 })
}
