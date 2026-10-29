function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revisa tu archivo .env.local (ver .env.example).`)
  }
  return value
}

// Las variables NEXT_PUBLIC_* deben leerse de forma literal para que Next.js las incluya en el cliente.
export const supabaseUrl = () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL)
export const supabaseAnonKey = () =>
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
export const supabaseServiceKey = () =>
  required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY)
// Opcional si la clave se configura en el panel (/admin/brand).
export const openaiApiKey = () =>
  required("OPENAI_API_KEY (o configúrala en el panel de administración)", process.env.OPENAI_API_KEY)
