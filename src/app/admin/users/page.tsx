import { PageHeader } from "@/components/admin/page-header"
import { UsersTable, type UserRow } from "@/components/admin/users-table"
import { getSettings } from "@/lib/assistant/settings"
import { createAdminClient } from "@/lib/supabase/admin"

function currentPeriod() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

export default async function UsersPage() {
  const db = createAdminClient()
  const [settings, profiles, usage] = await Promise.all([
    getSettings(),
    db.from("profiles").select("id, email, full_name, role, bonus_balance, bonus_granted_total, created_at").order("created_at", { ascending: false }),
    db.from("monthly_usage").select("user_id, free_used, bonus_used").eq("period", currentPeriod()),
  ])

  const byUser = new Map((usage.data ?? []).map((u) => [u.user_id, u]))
  const rows: UserRow[] = (profiles.data ?? []).map((p) => {
    const u = byUser.get(p.id)
    const freeUsed = u?.free_used ?? 0
    return {
      id: p.id,
      email: p.email,
      name: p.full_name,
      role: p.role,
      createdAt: p.created_at,
      usedThisMonth: freeUsed + (u?.bonus_used ?? 0),
      available: Math.max(settings.monthly_free_questions - freeUsed, 0) + p.bonus_balance,
      bonusBalance: p.bonus_balance,
      bonusGranted: p.bonus_granted_total,
    }
  })

  return (
    <>
      <PageHeader
        title="Usuarios"
        description={`Cada usuario recibe ${settings.monthly_free_questions} preguntas gratuitas al mes. Las preguntas adicionales no caducan.`}
      />
      <UsersTable rows={rows} />
    </>
  )
}
