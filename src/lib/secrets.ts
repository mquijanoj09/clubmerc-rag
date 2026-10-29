import "server-only"
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { supabaseServiceKey } from "@/lib/env"
import { createAdminClient } from "@/lib/supabase/admin"

/*
 * Las claves guardadas desde el panel se cifran con AES-256-GCM. La clave de
 * cifrado se deriva de SUPABASE_SERVICE_ROLE_KEY, así que un volcado de la
 * base de datos por sí solo no expone nada. Si se rota esa clave de Supabase,
 * hay que volver a introducir las claves en el panel.
 */
const key = () => createHash("sha256").update(`app-secrets:${supabaseServiceKey()}`).digest()

export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64"))).join(":")
}

export function decrypt(payload: string): string | null {
  try {
    const [version, iv, tag, data] = payload.split(":")
    if (version !== "v1") return null
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"))
    decipher.setAuthTag(Buffer.from(tag, "base64"))
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

export type SecretName = "openai_api_key"

const TTL_MS = 30_000
const memo = new Map<SecretName, { value: string | null; expires: number }>()

/** Lee una clave de la base de datos (con una caché breve). Devuelve null si no existe o no se puede descifrar. */
export async function getSecret(name: SecretName): Promise<string | null> {
  const hit = memo.get(name)
  if (hit && hit.expires > Date.now()) return hit.value

  const { data } = await createAdminClient().from("app_secrets").select("value").eq("key", name).maybeSingle()
  const value = data ? decrypt(data.value as string) : null
  memo.set(name, { value, expires: Date.now() + TTL_MS })
  return value
}

export async function setSecret(name: SecretName, value: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("app_secrets")
    .upsert({ key: name, value: encrypt(value), updated_at: new Date().toISOString() })
  if (error) throw error
  memo.delete(name)
}

export async function deleteSecret(name: SecretName): Promise<void> {
  const { error } = await createAdminClient().from("app_secrets").delete().eq("key", name)
  if (error) throw error
  memo.delete(name)
}

export function maskSecret(value: string): string {
  return `${value.slice(0, 3)}…${value.slice(-4)}`
}
