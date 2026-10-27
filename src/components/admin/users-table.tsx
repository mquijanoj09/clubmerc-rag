"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Gift, Loader2, Search } from "lucide-react"
import { toast } from "sonner"
import { grantQuestions } from "@/actions/admin"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export interface UserRow {
  id: string
  email: string
  name: string | null
  role: "admin" | "user"
  createdAt: string
  usedThisMonth: number
  available: number
  bonusBalance: number
  bonusGranted: number
}

const dateFormat = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" })

export function UsersTable({ rows }: { rows: UserRow[] }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [target, setTarget] = useState<UserRow | null>(null)
  const [pending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? rows.filter((r) => r.email.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q)) : rows
  }, [rows, query])

  function onGrant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!target) return
    const amount = Number(new FormData(event.currentTarget).get("amount"))
    startTransition(async () => {
      const result = await grantQuestions(target.id, amount)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Se concedieron ${amount} preguntas a ${target.name || target.email}.`)
      setTarget(null)
      router.refresh()
    })
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre o correo" className="h-9 pl-8" />
        </div>
        <span className="ml-auto text-sm whitespace-nowrap text-muted-foreground">{filtered.length} usuarios</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Usuario</TableHead>
            <TableHead>Registro</TableHead>
            <TableHead className="text-right">Usadas este mes</TableHead>
            <TableHead className="text-right">Disponibles</TableHead>
            <TableHead className="text-right">Adicionales concedidas</TableHead>
            <TableHead className="pr-4 text-right">
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="pl-4">
                <div className="flex items-center gap-2">
                  <div className="min-w-0">
                    <p className="max-w-56 truncate font-medium">{r.name || r.email}</p>
                    {r.name && <p className="max-w-56 truncate text-xs text-muted-foreground">{r.email}</p>}
                  </div>
                  {r.role === "admin" && <Badge variant="secondary">Admin</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{dateFormat.format(new Date(r.createdAt))}</TableCell>
              <TableCell className="text-right tabular-nums">{r.usedThisMonth}</TableCell>
              <TableCell className="text-right tabular-nums">
                {r.available}
                {r.bonusBalance > 0 && <span className="ml-1 text-xs text-muted-foreground">({r.bonusBalance} adic.)</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.bonusGranted}</TableCell>
              <TableCell className="pr-4 text-right">
                <Button variant="outline" size="sm" onClick={() => setTarget(r)}>
                  <Gift /> Conceder
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                No se encontraron usuarios.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={Boolean(target)} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conceder preguntas</DialogTitle>
            <DialogDescription>
              Se sumarán al saldo adicional de {target?.name || target?.email}. No caducan al cambiar de mes.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onGrant} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Cantidad</Label>
              <Input id="amount" name="amount" type="number" min={1} max={1000} defaultValue={10} required autoFocus className="h-10" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Conceder
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
