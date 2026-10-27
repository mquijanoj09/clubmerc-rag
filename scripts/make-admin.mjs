/**
 * Asigna el rol de administrador a una cuenta ya registrada.
 * Uso: npm run make-admin -- correo@ejemplo.com
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local.
 */
import { createClient } from "@supabase/supabase-js"

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error("Uso: npm run make-admin -- correo@ejemplo.com")
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const { data, error } = await supabase.from("profiles").update({ role: "admin" }).ilike("email", email).select("email")

if (error) {
  console.error("Error:", error.message)
  process.exit(1)
}
if (!data?.length) {
  console.error(`No existe ninguna cuenta con el correo ${email}. Regístrate primero en la aplicación.`)
  process.exit(1)
}
console.log(`✓ ${data[0].email} ahora es administrador.`)
