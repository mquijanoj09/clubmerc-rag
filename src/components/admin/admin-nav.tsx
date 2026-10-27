"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/assistant", label: "Configuración de la IA" },
  { href: "/admin/documents", label: "Documentos" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/requests", label: "Solicitudes de preguntas" },
  { href: "/admin/limits", label: "Límites y costos" },
] as const

export function AdminNav({ pendingRequests }: { pendingRequests: number }) {
  const pathname = usePathname()

  return (
    <nav className="mx-auto max-w-6xl overflow-x-auto px-2 [scrollbar-width:none]">
      <ul className="flex gap-1 pb-px">
        {LINKS.map((link) => {
          const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href)
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-10 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                  "after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:transition-opacity",
                  active && "font-medium text-foreground after:opacity-100"
                )}
              >
                {link.label}
                {link.href === "/admin/requests" && pendingRequests > 0 && (
                  <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] font-semibold text-primary-foreground tabular-nums">
                    {pendingRequests}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
