import { notFound } from "next/navigation"
import { ChatView } from "@/components/chat/chat-view"
import { createClient } from "@/lib/supabase/server"
import type { ChatMessage } from "@/lib/types"

export default async function ConversationPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  // RLS: solo devuelve la conversación si pertenece al usuario.
  const supabase = await createClient()
  const { data: conversation } = await supabase.from("conversations").select("id").eq("id", id).maybeSingle()
  if (!conversation) notFound()

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, status, sources, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })

  return <ChatView key={id} conversationId={id} initialMessages={(messages ?? []) as ChatMessage[]} />
}
