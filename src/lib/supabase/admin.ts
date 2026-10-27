import "server-only"
import { createClient } from "@supabase/supabase-js"
import { supabaseServiceKey, supabaseUrl } from "@/lib/env"

/**
 * Cliente con service role. Omite RLS: usar solo en el servidor y siempre
 * después de verificar la identidad y el rol del usuario.
 */
export function createAdminClient() {
  return createClient(supabaseUrl(), supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
