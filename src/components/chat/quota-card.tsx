import { Clock } from "lucide-react"
import type { QuestionRequest, Quota } from "@/lib/types"
import { cn } from "@/lib/utils"

export function freeRemaining(quota: Quota) {
  return Math.max(quota.free_limit - quota.free_used, 0)
}

export function QuotaCard({
  quota,
  requests,
  onRequestMore,
}: {
  quota: Quota | null
  requests: QuestionRequest[]
  onRequestMore: () => void
}) {
  if (!quota) return null
  const left = freeRemaining(quota)
  const pct = quota.free_limit > 0 ? (left / quota.free_limit) * 100 : 0
  const pending = requests.find((r) => r.status === "pending")
  const low = quota.remaining <= Math.max(2, Math.round(quota.free_limit * 0.1))

  return (
    <div className="rounded-xl border bg-background/60 p-3">
      <p className="text-[0.8rem] leading-snug">
        Te quedan <span className="font-semibold tabular-nums">{left}</span> de{" "}
        <span className="tabular-nums">{quota.free_limit}</span> preguntas este mes
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={left} aria-valuemin={0} aria-valuemax={quota.free_limit}>
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-out", low ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {quota.bonus_balance > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          + <span className="font-medium text-foreground tabular-nums">{quota.bonus_balance}</span> preguntas adicionales
        </p>
      )}
      {pending ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3" /> Solicitud de {pending.requested} preguntas pendiente
        </p>
      ) : null}
      <button
        type="button"
        onClick={onRequestMore}
        className="mt-2 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        {pending ? "Ver mis solicitudes" : "Solicitar más preguntas"}
      </button>
    </div>
  )
}
