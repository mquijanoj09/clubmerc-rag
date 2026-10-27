"use client"

import { ChatView } from "@/components/chat/chat-view"
import { useChat } from "@/components/chat/chat-context"

/** La clave reinicia el chat cuando el usuario pulsa "Nueva conversación". */
export function NewChat() {
  const { newChatKey } = useChat()
  return <ChatView key={newChatKey} conversationId={null} initialMessages={[]} />
}
