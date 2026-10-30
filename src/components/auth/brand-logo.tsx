/* eslint-disable @next/next/no-img-element -- los logos vienen de Supabase Storage y pueden cambiar */
import { AssistantAvatar } from "@/components/assistant-avatar"
import type { PublicAssistantInfo } from "@/lib/types"
import { cn } from "@/lib/utils"

type Props = {
  info: Pick<PublicAssistantInfo, "name" | "logo_url" | "logo_dark_url">
  /** "auto" sigue el tema; "dark" es para fondos oscuros (p. ej. el panel de marca). */
  surface?: "auto" | "dark"
  className?: string
}

/** Logo de la marca con su variante para fondos oscuros. Sin logo, muestra el ícono y el nombre. */
export function BrandLogo({ info, surface = "auto", className }: Props) {
  const { logo_url: light, logo_dark_url: dark } = info
  const img = "h-full w-auto max-w-[260px] object-contain"
  // Un logo sobre un fondo que no le corresponde se enmarca para que se lea.
  const framed = "rounded-xl bg-white px-3 py-2"

  if (!light && !dark) {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <AssistantAvatar size="md" />
        <span className={cn("text-lg font-semibold tracking-tight", surface === "dark" && "text-white")}>{info.name}</span>
      </div>
    )
  }

  if (surface === "dark") {
    return (
      <div className={cn("flex h-11", className)}>
        <img src={dark ?? light!} alt={info.name} className={cn(img, !dark && framed)} />
      </div>
    )
  }

  return (
    <div className={cn("flex h-11", className)}>
      {light && (
        <img
          src={light}
          alt={info.name}
          className={cn(img, dark ? "dark:hidden" : "dark:rounded-xl dark:bg-white dark:px-3 dark:py-2")}
        />
      )}
      {dark && (
        <img
          src={dark}
          alt={info.name}
          className={cn(img, light ? "hidden dark:block" : "rounded-xl bg-slate-900 px-3 py-2 dark:bg-transparent dark:p-0")}
        />
      )}
    </div>
  )
}
