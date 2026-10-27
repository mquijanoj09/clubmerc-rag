"use client"

import { useCallback, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Menu, PanelLeftOpen, SquarePen } from "lucide-react"
import { ChatContext, type ChatContextValue } from "@/components/chat/chat-context"
import { RequestDialog } from "@/components/chat/request-dialog"
import { Sidebar, type SidebarUser } from "@/components/chat/sidebar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Conversation, PublicAssistantInfo, QuestionRequest, Quota } from "@/lib/types"
import { cn } from "@/lib/utils"

interface ChatShellProps {
  user: SidebarUser
  info: PublicAssistantInfo
  initialQuota: Quota | null
  initialConversations: Conversation[]
  requests: QuestionRequest[]
  children: React.ReactNode
}

export function ChatShell({ user, info, initialQuota, initialConversations, requests, children }: ChatShellProps) {
  const router = useRouter()
  const [quota, setQuota] = useState(initialQuota)
  const [conversations, setConversations] = useState(initialConversations)
  const [newChatKey, setNewChatKey] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [requestOpen, setRequestOpen] = useState(false)

  // Sincroniza el estado local cuando el servidor envía datos nuevos (router.refresh).
  const [prevConversations, setPrevConversations] = useState(initialConversations)
  if (prevConversations !== initialConversations) {
    setPrevConversations(initialConversations)
    setConversations(initialConversations)
  }
  const [prevQuota, setPrevQuota] = useState(initialQuota)
  if (prevQuota !== initialQuota) {
    setPrevQuota(initialQuota)
    setQuota(initialQuota)
  }

  // Sube la conversación al inicio de la lista; si ya existe conserva su título.
  const upsertConversation = useCallback((conversation: Conversation) => {
    setConversations((list) => {
      const existing = list.find((c) => c.id === conversation.id)
      const next = existing ? { ...existing, updated_at: conversation.updated_at } : conversation
      return [next, ...list.filter((c) => c.id !== conversation.id)]
    })
  }, [])

  const startNewChat = useCallback(() => {
    setNewChatKey((k) => k + 1)
    setMobileOpen(false)
    router.push("/chat")
  }, [router])

  const removeConversation = useCallback((id: string) => {
    setConversations((list) => list.filter((c) => c.id !== id))
  }, [])

  const renameConversationLocal = useCallback((id: string, title: string) => {
    setConversations((list) => list.map((c) => (c.id === id ? { ...c, title } : c)))
  }, [])

  const value = useMemo<ChatContextValue>(
    () => ({
      info,
      quota,
      setQuota,
      conversations,
      upsertConversation,
      requests,
      newChatKey,
      openRequestDialog: () => setRequestOpen(true),
    }),
    [info, quota, conversations, upsertConversation, requests, newChatKey]
  )

  const sidebar = (onNavigate?: () => void, onCollapse?: () => void) => (
    <Sidebar
      user={user}
      info={info}
      quota={quota}
      requests={requests}
      conversations={conversations}
      onNewChat={startNewChat}
      onNavigate={onNavigate}
      onCollapse={onCollapse}
      onRemove={removeConversation}
      onRename={renameConversationLocal}
      onRequestMore={() => {
        setMobileOpen(false)
        setRequestOpen(true)
      }}
    />
  )

  return (
    <ChatContext.Provider value={value}>
      <div className="flex h-dvh overflow-hidden bg-background">
        <aside
          className={cn(
            "hidden shrink-0 overflow-hidden border-r bg-sidebar transition-[width] duration-200 ease-out md:block",
            collapsed ? "w-0 border-r-0" : "w-72"
          )}
        >
          <div className="h-full w-72">{sidebar(undefined, () => setCollapsed(true))}</div>
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" showCloseButton={false} className="w-[85%] max-w-80 gap-0 bg-sidebar p-0">
            <SheetTitle className="sr-only">Conversaciones</SheetTitle>
            {sidebar(() => setMobileOpen(false))}
          </SheetContent>
        </Sheet>

        <main className="relative flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 shrink-0 items-center gap-1 px-2 md:hidden">
            <Button variant="ghost" size="icon-lg" aria-label="Abrir menú" onClick={() => setMobileOpen(true)}>
              <Menu />
            </Button>
            <span className="flex-1 truncate text-center font-medium">{info.name}</span>
            <Button variant="ghost" size="icon-lg" aria-label="Nueva conversación" onClick={startNewChat}>
              <SquarePen />
            </Button>
          </header>

          {collapsed && (
            <div className="absolute top-3 left-3 z-10 hidden gap-1 md:flex animate-in fade-in-0">
              <Tooltip>
                <TooltipTrigger
                  render={<Button variant="ghost" size="icon-lg" aria-label="Mostrar barra lateral" onClick={() => setCollapsed(false)} />}
                >
                  <PanelLeftOpen />
                </TooltipTrigger>
                <TooltipContent side="right">Mostrar barra lateral</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={<Button variant="ghost" size="icon-lg" aria-label="Nueva conversación" onClick={startNewChat} />}>
                  <SquarePen />
                </TooltipTrigger>
                <TooltipContent side="right">Nueva conversación</TooltipContent>
              </Tooltip>
            </div>
          )}

          {children}
        </main>
      </div>

      <RequestDialog open={requestOpen} onOpenChange={setRequestOpen} requests={requests} quota={quota} />
    </ChatContext.Provider>
  )
}
