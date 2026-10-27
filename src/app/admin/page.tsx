import Link from "next/link"
import { ArrowRight, Coins, FileText, Inbox, MessageSquare, Gauge, Users, Cpu } from "lucide-react"
import { PageHeader } from "@/components/admin/page-header"
import { getSettings } from "@/lib/assistant/settings"
import { getMonthUsage } from "@/lib/openai/usage"
import { createAdminClient } from "@/lib/supabase/admin"
import { cn } from "@/lib/utils"

const number = new Intl.NumberFormat("es")
const usd = new Intl.NumberFormat("es", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 })

function currentPeriod() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

export default async function AdminOverview() {
  const db = createAdminClient()
  const [settings, usage, users, monthly, pending, docs] = await Promise.all([
    getSettings(),
    getMonthUsage(),
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("monthly_usage").select("free_used, bonus_used").eq("period", currentPeriod()),
    db.from("question_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("documents").select("status"),
  ])

  const questions = (monthly.data ?? []).reduce((sum, r) => sum + r.free_used + r.bonus_used, 0)
  const globalLeft = Math.max(settings.global_monthly_limit - questions, 0)
  const readyDocs = (docs.data ?? []).filter((d) => d.status === "ready").length
  const budgetPct = settings.monthly_budget_usd > 0 ? Math.min((usage.costUsd / settings.monthly_budget_usd) * 100, 100) : 100
  const monthName = new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(new Date())

  const stats = [
    { label: "Usuarios registrados", value: number.format(users.count ?? 0), icon: Users, href: "/admin/users" },
    { label: "Preguntas este mes", value: number.format(questions), icon: MessageSquare },
    {
      label: "Restantes del límite global",
      value: number.format(globalLeft),
      hint: `de ${number.format(settings.global_monthly_limit)}`,
      icon: Gauge,
      href: "/admin/limits",
    },
    {
      label: "Tokens consumidos",
      value: number.format(usage.inputTokens + usage.outputTokens),
      hint: `${number.format(usage.inputTokens)} entrada · ${number.format(usage.outputTokens)} salida`,
      icon: Cpu,
    },
    { label: "Solicitudes pendientes", value: number.format(pending.count ?? 0), icon: Inbox, href: "/admin/requests", highlight: (pending.count ?? 0) > 0 },
    { label: "Documentos disponibles", value: number.format(readyDocs), hint: `de ${(docs.data ?? []).length} cargados`, icon: FileText, href: "/admin/documents" },
  ]

  return (
    <>
      <PageHeader title="Resumen" description={`Uso del asistente en ${monthName}.`} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(({ label, value, hint, icon: Icon, href, highlight }) => {
          const content = (
            <>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                {label}
                <Icon className="size-4" />
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
              <p className="mt-1 h-4 text-xs text-muted-foreground">{hint}</p>
            </>
          )
          const className = cn(
            "group relative rounded-2xl border bg-card p-5 shadow-xs transition-colors",
            href && "hover:border-foreground/20",
            highlight && "border-amber-500/40 bg-amber-500/5"
          )
          return href ? (
            <Link key={label} href={href} className={className}>
              {content}
              <ArrowRight className="absolute right-5 bottom-5 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ) : (
            <div key={label} className={className}>
              {content}
            </div>
          )
        })}
      </div>

      <section className="mt-3 rounded-2xl border bg-card p-5 shadow-xs">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          Costo estimado del mes
          <Coins className="size-4" />
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{usd.format(usage.costUsd)}</p>
          <p className="text-sm text-muted-foreground">de {usd.format(settings.monthly_budget_usd)} de presupuesto</p>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", budgetPct >= 90 ? "bg-destructive" : budgetPct >= 70 ? "bg-amber-500" : "bg-primary")}
            style={{ width: `${budgetPct}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Estimación calculada con los tokens que informa OpenAI y los precios configurados en el código. Puede diferir
          de la facturación real; revisa tu panel de OpenAI para el importe exacto.
        </p>
      </section>
    </>
  )
}
