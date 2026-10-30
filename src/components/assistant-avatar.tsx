"use client"

/* eslint-disable @next/next/no-img-element -- el isotipo viene de Supabase Storage y puede cambiar */
import { Sparkles } from "lucide-react"
import { useBrand } from "@/components/brand-provider"
import { cn } from "@/lib/utils"

export function AssistantAvatar({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const { iconUrl, iconDarkUrl } = useBrand()
  const sizes = cn(
    size === "sm" && "size-7 rounded-lg [&_svg]:size-3.5",
    size === "md" && "size-8 [&_svg]:size-4",
    size === "lg" && "size-14 rounded-2xl [&_svg]:size-6"
  )

  // Con isotipo configurado se muestra tal cual, sin fondo; la versión oscura sigue el tema.
  if (iconUrl || iconDarkUrl) {
    const light = iconUrl ?? iconDarkUrl!
    return (
      <div aria-hidden className={cn("flex shrink-0 items-center justify-center", sizes, className)}>
        <img src={light} alt="" className={cn("size-full object-contain", iconDarkUrl && "dark:hidden")} />
        {iconDarkUrl && <img src={iconDarkUrl} alt="" className="hidden size-full object-contain dark:block" />}
      </div>
    )
  }

  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--brand)] to-[var(--brand-accent)] text-primary-foreground shadow-sm",
        sizes,
        className
      )}
    >
      <Sparkles />
    </div>
  )
}
