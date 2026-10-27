"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { createQuestionRequest } from "@/actions/chat"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { QuestionRequest, Quota, RequestStatus } from "@/lib/types"

export const REQUEST_STATUS: Record<RequestStatus, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  approved: { label: "Aprobada", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  rejected: { label: "Rechazada", className: "bg-destructive/10 text-destructive" },
}

const dateFormat = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" })

export function RequestDialog({
  open,
  onOpenChange,
  requests,
  quota,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  requests: QuestionRequest[]
  quota: Quota | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const hasPending = requests.some((r) => r.status === "pending")

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError("")
    startTransition(async () => {
      const result = await createQuestionRequest({
        requested: Number(form.get("requested")),
        reason: String(form.get("reason") ?? ""),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Solicitud enviada", { description: "El administrador la revisará pronto." })
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar más preguntas</DialogTitle>
          <DialogDescription>
            {quota && quota.remaining === 0
              ? "Has utilizado todas tus preguntas disponibles este mes. "
              : ""}
            El administrador revisará tu solicitud y podrá aprobarla total o parcialmente.
          </DialogDescription>
        </DialogHeader>

        {hasPending ? (
          <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            Ya tienes una solicitud pendiente. Podrás enviar otra cuando sea revisada.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="requested">Cantidad de preguntas</Label>
              <Input id="requested" name="requested" type="number" min={1} max={500} defaultValue={10} required className="h-10" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">
                Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Textarea id="reason" name="reason" maxLength={500} rows={3} placeholder="Cuéntale al administrador para qué las necesitas" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="h-10 w-full" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Enviar solicitud
            </Button>
          </form>
        )}

        {requests.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-medium text-muted-foreground">Mis solicitudes</p>
            <ul className="space-y-1.5">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">
                    {r.requested} preguntas
                    {r.status === "approved" && r.granted !== r.requested && (
                      <span className="text-muted-foreground"> · {r.granted} concedidas</span>
                    )}
                    <span className="text-muted-foreground"> · {dateFormat.format(new Date(r.created_at))}</span>
                  </span>
                  <Badge className={REQUEST_STATUS[r.status].className}>{REQUEST_STATUS[r.status].label}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
