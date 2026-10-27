/**
 * Pruebas contra una base de datos Supabase real (local o de pruebas).
 * Se ejecutan solo si existen las variables de entorno:
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY
 * Ejemplo local: `npx supabase start` y luego `npm run test:db`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

const url = process.env.TEST_SUPABASE_URL
const anonKey = process.env.TEST_SUPABASE_ANON_KEY
const serviceKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
const enabled = Boolean(url && anonKey && serviceKey)

const options = { auth: { persistSession: false, autoRefreshToken: false } }

describe.skipIf(!enabled)("base de datos", () => {
  let admin: SupabaseClient
  const users: { id: string; client: SupabaseClient }[] = []
  const password = "contraseña-segura-123"
  let originalSettings: Record<string, unknown>

  async function createUser() {
    const email = `test-${crypto.randomUUID()}@example.com`
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error) throw error
    const client = createClient(url!, anonKey!, options)
    await client.auth.signInWithPassword({ email, password })
    const user = { id: data.user.id, client }
    users.push(user)
    return user
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, options)
    const { data } = await admin.from("assistant_settings").select("*").eq("id", 1).single()
    originalSettings = data!
  })

  afterAll(async () => {
    if (!admin) return
    const { monthly_free_questions, global_monthly_limit } = originalSettings
    await admin.from("assistant_settings").update({ monthly_free_questions, global_monthly_limit }).eq("id", 1)
    for (const u of users) await admin.auth.admin.deleteUser(u.id)
  })

  it("crea el perfil con rol 'user' aunque el cliente envíe otro rol en los metadatos", async () => {
    const email = `test-${crypto.randomUUID()}@example.com`
    const { data } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "admin", full_name: "Ana" },
    })
    users.push({ id: data.user!.id, client: admin })
    const { data: profile } = await admin.from("profiles").select("role, full_name").eq("id", data.user!.id).single()
    expect(profile).toEqual({ role: "user", full_name: "Ana" })
  })

  it("impide que un usuario se asigne el rol de administrador o modifique su saldo", async () => {
    const u = await createUser()
    await u.client.from("profiles").update({ role: "admin", bonus_balance: 999 }).eq("id", u.id)
    const { data } = await admin.from("profiles").select("role, bonus_balance").eq("id", u.id).single()
    expect(data).toEqual({ role: "user", bonus_balance: 0 })
  })

  it("impide a los usuarios invocar las funciones de saldo", async () => {
    const u = await createUser()
    for (const [fn, args] of [
      ["reserve_question", { p_user: u.id }],
      ["grant_bonus", { p_user: u.id, p_amount: 100 }],
      ["get_quota", { p_user: u.id }],
    ] as const) {
      const { error } = await u.client.rpc(fn, args)
      expect(error, fn).not.toBeNull()
    }
  })

  it("aísla conversaciones, configuración y documentos con RLS", async () => {
    const a = await createUser()
    const b = await createUser()
    const { data: conv } = await admin.from("conversations").insert({ user_id: a.id, title: "Privada" }).select("id").single()
    await admin.from("messages").insert({ conversation_id: conv!.id, user_id: a.id, role: "user", content: "secreto" })

    expect((await a.client.from("conversations").select("id")).data).toHaveLength(1)
    expect((await b.client.from("conversations").select("id")).data).toHaveLength(0)
    expect((await b.client.from("messages").select("id")).data).toHaveLength(0)
    expect((await b.client.from("assistant_settings").select("*")).data).toHaveLength(0)
    expect((await b.client.from("documents").select("*")).data).toHaveLength(0)

    // Un usuario no puede insertar mensajes ni borrar conversaciones ajenas.
    const { error } = await b.client.from("messages").insert({ conversation_id: conv!.id, user_id: b.id, role: "assistant", content: "x" })
    expect(error).not.toBeNull()
    await b.client.from("conversations").delete().eq("id", conv!.id)
    expect((await admin.from("conversations").select("id").eq("id", conv!.id)).data).toHaveLength(1)
  })

  it("no permite superar el saldo con solicitudes simultáneas", async () => {
    await admin.from("assistant_settings").update({ monthly_free_questions: 3, global_monthly_limit: 100000 }).eq("id", 1)
    const u = await createUser()
    const results = await Promise.all(Array.from({ length: 10 }, () => admin.rpc("reserve_question", { p_user: u.id })))
    const statuses = results.map((r) => r.data.status)
    expect(statuses.filter((s) => s === "ok")).toHaveLength(3)
    expect(statuses.filter((s) => s === "no_quota")).toHaveLength(7)

    const { data: quota } = await admin.rpc("get_quota", { p_user: u.id })
    expect(quota).toMatchObject({ free_limit: 3, free_used: 3, remaining: 0 })
  })

  it("devuelve preguntas, usa el saldo adicional y lo reembolsa correctamente", async () => {
    await admin.from("assistant_settings").update({ monthly_free_questions: 1 }).eq("id", 1)
    const u = await createUser()
    const first = (await admin.rpc("reserve_question", { p_user: u.id })).data
    expect(first.bucket).toBe("free")
    await admin.rpc("refund_question", { p_user: u.id, p_bucket: "free", p_period: first.period })
    expect((await admin.rpc("get_quota", { p_user: u.id })).data.remaining).toBe(1)

    await admin.rpc("reserve_question", { p_user: u.id })
    await admin.rpc("grant_bonus", { p_user: u.id, p_amount: 2 })
    const bonus = (await admin.rpc("reserve_question", { p_user: u.id })).data
    expect(bonus.bucket).toBe("bonus")
    expect((await admin.rpc("get_quota", { p_user: u.id })).data).toMatchObject({ bonus_balance: 1, remaining: 1 })

    await admin.rpc("refund_question", { p_user: u.id, p_bucket: "bonus", p_period: bonus.period })
    expect((await admin.rpc("get_quota", { p_user: u.id })).data).toMatchObject({ bonus_balance: 2, bonus_used: 0 })
  })

  it("aplica el límite global de preguntas", async () => {
    const { data: rows } = await admin.from("monthly_usage").select("free_used, bonus_used")
    const used = (rows ?? []).reduce((s, r) => s + r.free_used + r.bonus_used, 0)
    await admin.from("assistant_settings").update({ monthly_free_questions: 50, global_monthly_limit: used }).eq("id", 1)
    const u = await createUser()
    expect((await admin.rpc("reserve_question", { p_user: u.id })).data.status).toBe("global_limit")
  })

  it("aprueba una solicitud una sola vez y suma lo concedido", async () => {
    const u = await createUser()
    const { data: req } = await admin.from("question_requests").insert({ user_id: u.id, requested: 50 }).select("id").single()

    const [r1, r2] = await Promise.all([
      admin.rpc("review_request", { p_request: req!.id, p_approve: true, p_granted: 20, p_admin: u.id }),
      admin.rpc("review_request", { p_request: req!.id, p_approve: true, p_granted: 20, p_admin: u.id }),
    ])
    expect([r1.error, r2.error].filter(Boolean)).toHaveLength(1)
    expect([r1, r2].find((r) => r.error)!.error!.message).toContain("ALREADY_REVIEWED")

    const { data: profile } = await admin.from("profiles").select("bonus_balance, bonus_granted_total").eq("id", u.id).single()
    expect(profile).toEqual({ bonus_balance: 20, bonus_granted_total: 20 })
    const { data: own } = await u.client.from("question_requests").select("status, granted")
    expect(own).toEqual([{ status: "approved", granted: 20 }])
  })

  it("busca fragmentos por similitud respetando el umbral", async () => {
    const vec = (hot: number) => JSON.stringify(Array.from({ length: 1536 }, (_, i) => (i === hot ? 1 : 0.01)))
    const { data: doc } = await admin
      .from("documents")
      .insert({ name: "prueba.md", storage_path: `test/${crypto.randomUUID()}`, mime_type: "text/markdown", size_bytes: 1, status: "ready" })
      .select("id")
      .single()
    await admin.from("document_chunks").insert([
      { document_id: doc!.id, chunk_index: 0, content: "A", embedding: vec(1) },
      { document_id: doc!.id, chunk_index: 1, content: "B", embedding: vec(2) },
    ])

    const { data } = await admin.rpc("match_chunks", { query_embedding: vec(1), match_count: 5, min_similarity: 0.5 })
    expect(data.map((r: { content: string }) => r.content)).toEqual(["A"])
    expect(data[0].document_name).toBe("prueba.md")

    await admin.from("documents").delete().eq("id", doc!.id)
  })

  it("mantiene privado el bucket de documentos", async () => {
    const u = await createUser()
    const path = `test/${crypto.randomUUID()}.txt`
    await admin.storage.from("documents").upload(path, new Blob(["confidencial"]), { contentType: "text/plain" })
    const { data, error } = await u.client.storage.from("documents").download(path)
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect((await u.client.storage.from("documents").upload(`test/${crypto.randomUUID()}.txt`, new Blob(["x"]))).error).not.toBeNull()
    await admin.storage.from("documents").remove([path])
  })
})
