/* eslint-disable @next/next/no-img-element -- las imágenes vienen de Supabase Storage y pueden cambiar */
import { MessageCircleQuestion, Sparkles } from "lucide-react"
import { BrandLogo } from "@/components/auth/brand-logo"
import type { PublicAssistantInfo } from "@/lib/types"
import { cn } from "@/lib/utils"

const PATTERN_ROWS = 9
const PATTERN_COLS = 8

/** Ícono de la marca repetido como marca de agua, en filas alternadas. */
export function BrandPattern({ iconUrl, className }: { iconUrl: string | null; className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute -inset-1/4 flex -rotate-12 flex-col justify-center gap-10">
        {Array.from({ length: PATTERN_ROWS }, (_, row) => (
          <div key={row} className={cn("flex justify-center gap-12", row % 2 === 1 && "translate-x-16")}>
            {Array.from({ length: PATTERN_COLS }, (_, col) =>
              iconUrl ? (
                <img key={col} src={iconUrl} alt="" className="size-14 shrink-0 object-contain brightness-0 invert" />
              ) : (
                <Sparkles key={col} className="size-14 shrink-0 text-white" strokeWidth={1.25} />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Mitad visual de la pantalla de inicio: imagen configurada o fondo de marca. */
export function AuthHero({ info }: { info: PublicAssistantInfo }) {
  const examples = info.suggested_questions.slice(0, 3)
  const image = info.auth_image_url

  return (
    <aside className="relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      {image ? (
        <>
          <img src={image} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/40" />
        </>
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(140deg, var(--brand) 0%, color-mix(in oklab, var(--brand) 60%, var(--brand-accent)) 55%, var(--brand-accent) 100%)",
            }}
          />
          <BrandPattern iconUrl={info.icon_url ?? info.icon_dark_url} className="opacity-[0.08]" />
          <div className="absolute -top-32 -right-32 size-[28rem] rounded-full bg-[var(--brand-accent)] opacity-40 blur-3xl" />
          <div className="absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-[var(--brand)] opacity-60 blur-3xl" />
        </>
      )}

      <BrandLogo info={info} surface="dark" className="relative h-14 animate-in fade-in-0 duration-700" />

      <div className="relative max-w-lg animate-in fade-in-0 slide-in-from-bottom-3 duration-700">
        <h2 className="text-4xl leading-tight font-semibold tracking-tight text-balance xl:text-5xl">{info.name}</h2>
        {info.auth_message && <p className="mt-4 text-lg text-pretty whitespace-pre-line text-white/85">{info.auth_message}</p>}

        {examples.length > 0 && (
          <div className="mt-10">
            <p className="text-xs font-medium tracking-wider text-white/60 uppercase">Puedes preguntar, por ejemplo</p>
            <ul className="mt-3 space-y-2">
              {examples.map((q) => (
                <li
                  key={q}
                  className="flex items-start gap-2.5 rounded-xl bg-white/10 px-4 py-3 text-sm ring-1 ring-white/15 backdrop-blur-md"
                >
                  <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-white/70" />
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </aside>
  )
}
