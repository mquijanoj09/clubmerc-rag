import { connection } from "next/server"
import { AssistantAvatar } from "@/components/assistant-avatar"
import { ThemeToggle } from "@/components/theme-toggle"
import { getPublicAssistantInfo } from "@/lib/assistant/settings"

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  // La configuración puede cambiar en cualquier momento: no se prerenderiza.
  await connection()
  const info = await getPublicAssistantInfo()

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-muted/70 to-transparent"
      />
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
        <div className="mb-8 flex flex-col items-center text-center">
          {info.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- el logo viene de Supabase Storage y puede cambiar
            <img src={info.logo_url} alt="" className="h-14 w-auto max-w-[240px] object-contain" />
          ) : (
            <AssistantAvatar size="lg" />
          )}
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">{info.name}</h1>
          <p className="mt-1.5 text-sm text-balance text-muted-foreground">{info.description}</p>
        </div>
        {children}
      </div>
    </div>
  )
}
