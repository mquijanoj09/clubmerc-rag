import { ChatShell } from "@/components/chat/chat-shell"
import { getPublicAssistantInfo } from "@/lib/assistant/settings"
import { requireUser } from "@/lib/auth"
import { getQuota } from "@/lib/quota/quota"
import { createClient } from "@/lib/supabase/server"
import type { Conversation, QuestionRequest } from "@/lib/types"

export default async function ChatLayout({ children }: LayoutProps<"/chat">) {
  const user = await requireUser()
  const supabase = await createClient()

  const [info, quota, conversations, requests] = await Promise.all([
    getPublicAssistantInfo(),
    getQuota(user.id),
    supabase.from("conversations").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(100),
    supabase
      .from("question_requests")
      .select("id, user_id, requested, reason, status, granted, reviewed_at, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  return (
    <ChatShell
      user={{ email: user.email, name: user.full_name, isAdmin: user.role === "admin" }}
      info={info}
      initialQuota={quota}
      initialConversations={(conversations.data ?? []) as Conversation[]}
      requests={(requests.data ?? []) as QuestionRequest[]}
    >
      {children}
    </ChatShell>
  )
}
