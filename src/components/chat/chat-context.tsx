"use client"

import { createContext, useContext } from "react"
import type { Conversation, PublicAssistantInfo, QuestionRequest, Quota } from "@/lib/types"

export interface ChatContextValue {
  info: PublicAssistantInfo
  quota: Quota | null
  setQuota: (quota: Quota | null) => void
  conversations: Conversation[]
  upsertConversation: (conversation: Conversation) => void
  requests: QuestionRequest[]
  newChatKey: number
  openRequestDialog: () => void
}

export const ChatContext = createContext<ChatContextValue | null>(null)

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error("useChat debe usarse dentro de ChatShell")
  return ctx
}
