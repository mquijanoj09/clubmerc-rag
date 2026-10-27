import { PageHeader } from "@/components/admin/page-header"
import { RequestsTable, type RequestRow } from "@/components/admin/requests-table"
import { createAdminClient } from "@/lib/supabase/admin"

export default async function RequestsPage() {
  const { data } = await createAdminClient()
    .from("question_requests")
    .select("id, requested, reason, status, granted, created_at, reviewed_at, profiles!question_requests_user_id_fkey(email, full_name)")
    .order("created_at", { ascending: false })
    .limit(200)

  const rows: RequestRow[] = (data ?? []).map((r) => {
    const profile = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as { email: string; full_name: string | null } | null
    return {
      id: r.id,
      requested: r.requested,
      reason: r.reason,
      status: r.status,
      granted: r.granted,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
      user: profile?.full_name || profile?.email || "Usuario eliminado",
      email: profile?.email ?? "",
    }
  })

  return (
    <>
      <PageHeader
        title="Solicitudes de preguntas"
        description="Aprueba, ajusta o rechaza las solicitudes. Las preguntas aprobadas se suman al saldo del usuario."
      />
      <RequestsTable rows={rows} />
    </>
  )
}
