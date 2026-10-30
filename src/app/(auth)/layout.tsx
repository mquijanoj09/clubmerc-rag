import { connection } from "next/server"
import { AuthHero } from "@/components/auth/auth-hero"
import { BrandLogo } from "@/components/auth/brand-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { getPublicAssistantInfo } from "@/lib/assistant/settings"

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  // La configuración puede cambiar en cualquier momento: no se prerenderiza.
  await connection()
  const info = await getPublicAssistantInfo()

  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <AuthHero info={info} />

      <main className="relative flex min-h-full flex-col items-center justify-center overflow-hidden px-4 py-12 sm:px-8">
        {/* En móvil no hay panel lateral: un brillo suave con los colores de la marca. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 opacity-60 lg:hidden"
          style={{
            backgroundImage:
              "radial-gradient(60% 100% at 50% 0%, color-mix(in oklab, var(--brand-accent) 35%, transparent), transparent)",
          }}
        />
        <ThemeToggle className="absolute top-4 right-4" />

        <div className="w-full max-w-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
          {/* En escritorio el logo y el mensaje ya están en el panel de marca. */}
          <div className="mb-8 flex flex-col items-center gap-4 text-center lg:hidden">
            <BrandLogo info={info} />
            {info.auth_message && <p className="text-sm text-pretty whitespace-pre-line text-muted-foreground">{info.auth_message}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
