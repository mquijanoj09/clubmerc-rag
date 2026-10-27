"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Inbox, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { reviewRequest } from "@/actions/admin"
import { REQUEST_STATUS } from "@/components/chat/request-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { RequestStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface RequestRow {
  id: string
  requested: number
  reason: string | null
  status: RequestStatus
  granted: number | null
  createdAt: string
  reviewedAt: string | null
  user: string
  email: string
}

const dateFormat = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const FILTERS = [
  { value: "pending", label: "Pendientes" },
  { value: "all", label: "Todas" },
] as const

export function RequestsTable({ rows }: { rows: RequestRow[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<"pending" | "all">("pending")
  const [approving, setApproving] = useState<RequestRow | null>(null)
  const [pending, startTransition] = useTransition()
  const visible = filter === "pending" ? rows.filter((r) => r.status === "pending") : rows
  const pendingCount = rows.filter((r) => r.status === "pending").length

  function review(row: RequestRow, approve: boolean, granted?: number) {
    startTransition(async () => {
      const result = await reviewRequest(row.id, approve, granted)
      if (!result.ok) {
        toast.error(result.error)
      } else {
        toast.success(approve ? `Solicitud aprobada: ${granted} preguntas para ${row.user}.` : "Solicitud rechazada.")
        setApproving(null)
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg bg-muted p-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
              filter === f.value && "bg-background font-medium text-foreground shadow-sm"
            )}
          >
            {f.label}
            {f.value === "pending" && pendingCount > 0 && <span className="ml-1.5 tabular-nums">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border bg-card px-6 py-14 text-center shadow-xs">
          <Inbox className="size-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">{filter === "pending" ? "No hay solicitudes pendientes" : "Aún no hay solicitudes"}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-xs sm:flex-row sm:items-center animate-in fade-in-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.user}</span>
                  {r.email && r.email !== r.user && <span className="text-sm text-muted-foreground">{r.email}</span>}
                  <Badge className={REQUEST_STATUS[r.status].className}>{REQUEST_STATUS[r.status].label}</Badge>
                </div>
                <p className="mt-1 text-sm">
                  Solicita <span className="font-semibold tabular-nums">{r.requested}</span> preguntas
                  {r.status === "approved" && (
                    <span className="text-muted-foreground"> · se concedieron {r.granted}</span>
                  )}
                  <span className="text-muted-foreground"> · {dateFormat.format(new Date(r.createdAt))}</span>
                </p>
                {r.reason && <p className="mt-1.5 text-sm text-muted-foreground">«{r.reason}»</p>}
              </div>
              {r.status === "pending" && (
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" onClick={() => review(r, false)} disabled={pending}>
                    <X /> Rechazar
                  </Button>
                  <Button onClick={() => setApproving(r)} disabled={pending}>
                    <Check /> Aprobar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(approving)} onOpenChange={(open) => !open && setApproving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprobar solicitud</DialogTitle>
            <DialogDescription>
              {approving?.user} solicitó {approving?.requested} preguntas. Puedes conceder una cantidad diferente.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (approving) review(approving, true, Number(new FormData(e.currentTarget).get("granted")))
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="granted">Preguntas a conceder</Label>
              <Input
                id="granted"
                name="granted"
                type="number"
                min={1}
                max={1000}
                defaultValue={approving?.requested}
                required
                autoFocus
                className="h-10"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Aprobar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
