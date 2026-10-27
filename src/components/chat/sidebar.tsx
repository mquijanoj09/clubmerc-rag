"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { LogOut, MoreHorizontal, PanelLeftClose, Pencil, Settings2, SquarePen, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { deleteConversation, renameConversation } from "@/actions/chat"
import { AssistantAvatar } from "@/components/assistant-avatar"
import { QuotaCard } from "@/components/chat/quota-card"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import type { Conversation, PublicAssistantInfo, QuestionRequest, Quota } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface SidebarUser {
  email: string
  name: string | null
  isAdmin: boolean
}

interface SidebarProps {
  user: SidebarUser
  info: PublicAssistantInfo
  quota: Quota | null
  requests: QuestionRequest[]
  conversations: Conversation[]
  onNewChat: () => void
  onNavigate?: () => void
  onCollapse?: () => void
  onRemove: (id: string) => void
  onRename: (id: string, title: string) => void
  onRequestMore: () => void
}

function groupConversations(conversations: Conversation[]) {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const day = 86_400_000
  const groups: { label: string; items: Conversation[] }[] = [
    { label: "Hoy", items: [] },
    { label: "Ayer", items: [] },
    { label: "Últimos 7 días", items: [] },
    { label: "Anteriores", items: [] },
  ]
  for (const c of conversations) {
    const t = new Date(c.updated_at).getTime()
    const index = t >= startOfToday.getTime() ? 0 : t >= startOfToday.getTime() - day ? 1 : t >= startOfToday.getTime() - 7 * day ? 2 : 3
    groups[index].items.push(c)
  }
  return groups.filter((g) => g.items.length > 0)
}

export function Sidebar(props: SidebarProps) {
  const { user, info, quota, requests, conversations, onNewChat, onNavigate, onCollapse, onRequestMore } = props
  const pathname = usePathname()
  const router = useRouter()
  const [toDelete, setToDelete] = useState<Conversation | null>(null)
  const [toRename, setToRename] = useState<Conversation | null>(null)
  const [pending, startTransition] = useTransition()

  function confirmDelete() {
    if (!toDelete) return
    const target = toDelete
    startTransition(async () => {
      const result = await deleteConversation(target.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      props.onRemove(target.id)
      setToDelete(null)
      if (pathname === `/chat/${target.id}`) onNewChat()
    })
  }

  function submitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!toRename) return
    const target = toRename
    const title = String(new FormData(event.currentTarget).get("title")).trim()
    if (!title) return
    startTransition(async () => {
      const result = await renameConversation(target.id, title)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      props.onRename(target.id, title)
      setToRename(null)
    })
  }

  const displayName = user.name || user.email

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
        <AssistantAvatar size="sm" />
        <span className="flex-1 truncate text-sm font-semibold">{info.name}</span>
        {onCollapse && (
          <Button variant="ghost" size="icon" aria-label="Ocultar barra lateral" onClick={onCollapse}>
            <PanelLeftClose />
          </Button>
        )}
      </div>

      <div className="px-3 pb-2">
        <Button variant="outline" className="h-9 w-full justify-start gap-2 bg-background" onClick={onNewChat}>
          <SquarePen />
          Nueva conversación
        </Button>
      </div>

      <nav aria-label="Conversaciones" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Tus conversaciones aparecerán aquí.</p>
        ) : (
          groupConversations(conversations).map((group) => (
            <div key={group.label} className="mt-3 first:mt-1">
              <p className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{group.label}</p>
              <ul>
                {group.items.map((c) => {
                  const active = pathname === `/chat/${c.id}`
                  return (
                    <li key={c.id} className="group/item relative">
                      <Link
                        href={`/chat/${c.id}`}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex h-9 items-center rounded-lg pr-9 pl-2.5 text-sm transition-colors hover:bg-sidebar-accent",
                          active && "bg-sidebar-accent font-medium"
                        )}
                      >
                        <span className="truncate">{c.title}</span>
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Opciones de ${c.title}`}
                              className={cn(
                                "absolute top-1 right-1 text-muted-foreground opacity-100 hover:bg-background/60 md:opacity-0 md:group-hover/item:opacity-100 md:focus-visible:opacity-100 md:aria-expanded:opacity-100",
                                active && "md:opacity-100"
                              )}
                            />
                          }
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => setToRename(c)}>
                            <Pencil /> Renombrar
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onClick={() => setToDelete(c)}>
                            <Trash2 /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </nav>

      <div className="space-y-2 border-t p-3">
        <QuotaCard quota={quota} requests={requests} onRequestMore={onRequestMore} />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-sidebar-accent aria-expanded:bg-sidebar-accent"
              />
            }
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
              {displayName.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{displayName}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {user.isAdmin ? "Administrador" : user.email}
              </span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-64">
            {user.isAdmin && (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    onNavigate?.()
                    router.push("/admin")
                  }}
                >
                  <Settings2 /> Panel de administración
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <div className="flex items-center justify-between gap-2 px-1.5 py-1">
              <span className="text-sm">Tema</span>
              <ThemeToggle />
            </div>
            <DropdownMenuSeparator />
            <form action="/auth/signout" method="post">
              <DropdownMenuItem render={<button type="submit" className="w-full" />} nativeButton>
                <LogOut /> Cerrar sesión
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar conversación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{toDelete?.title}» y todos sus mensajes. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={pending}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(toRename)} onOpenChange={(open) => !open && setToRename(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renombrar conversación</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitRename} className="space-y-4">
            <Input name="title" defaultValue={toRename?.title} maxLength={80} autoFocus required className="h-10" />
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
