import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { AdminNav } from "@/components/admin/admin-nav"
import { AssistantAvatar } from "@/components/assistant-avatar"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { requireAdmin } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"

export const metadata = { title: "Administración" }

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin()
  const { count: pending } = await createAdminClient()
    .from("question_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")

  return (
    <div className="min-h-full bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <AssistantAvatar size="sm" />
          <span className="font-semibold tracking-tight">Administración</span>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />
            <Button variant="ghost" render={<Link href="/chat" />} nativeButton={false}>
              <ArrowLeft />
              <span className="hidden sm:inline">Volver al chat</span>
              <span className="sm:hidden">Chat</span>
            </Button>
          </div>
        </div>
        <AdminNav pendingRequests={pending ?? 0} />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  )
}
