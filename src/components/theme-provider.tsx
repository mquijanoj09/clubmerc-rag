"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

// next-themes inserta un <script> que aplica el tema antes de pintar (evita el parpadeo).
// Solo hace falta que se ejecute en el HTML del servidor; en el cliente se marca como
// texto plano para que React 19 no advierta «Encountered a script tag…».
const scriptProps = typeof window === "undefined" ? undefined : ({ type: "text/plain" } as const)

export function ThemeProvider(props: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider scriptProps={scriptProps} {...props} />
}
