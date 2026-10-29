"use client"

import { Sparkles } from "lucide-react"
import { useBrand } from "@/components/brand-provider"
import { cn } from "@/lib/utils"

export function AssistantAvatar({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const { iconUrl } = useBrand()
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl text-primary-foreground shadow-sm",
        iconUrl ? "bg-white ring-1 ring-border" : "bg-gradient-to-br from-[var(--brand)] to-[var(--brand-accent)]",
        size === "sm" && "size-7 rounded-lg [&_svg]:size-3.5",
        size === "md" && "size-8 [&_svg]:size-4",
        size === "lg" && "size-14 rounded-2xl [&_svg]:size-6",
        className
      )}
    >
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- el ícono viene de Supabase Storage y puede cambiar
        <img src={iconUrl} alt="" className="size-full object-contain" />
      ) : (
        <Sparkles />
      )}
    </div>
  )
}
