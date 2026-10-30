import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { connection } from "next/server"
import { BrandProvider } from "@/components/brand-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { getPublicAssistantInfo } from "@/lib/assistant/settings"
import { DEFAULT_BRAND, readableOn } from "@/lib/color"
import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

/** La marca vive en la base de datos: si no está disponible, la app usa los valores por defecto. */
async function loadBrand() {
  await connection()
  try {
    return await getPublicAssistantInfo()
  } catch {
    return null
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const info = await loadBrand()
  const name = info?.name ?? "Asistente IA"
  return {
    title: { default: name, template: `%s · ${name}` },
    // Solo el ícono cuadrado sirve como favicon: un logo horizontal se vuelve ilegible a 16 px.
    icons: {
      icon: info?.icon_url
        ? [
            { url: info.icon_url, media: "(prefers-color-scheme: light)" },
            // El favicon sigue el tema del navegador, no el de la app.
            { url: info.icon_dark_url ?? info.icon_url, media: "(prefers-color-scheme: dark)" },
          ]
        : "/brand-icon.svg",
    },
  }
}

export async function generateViewport(): Promise<Viewport> {
  const info = await loadBrand()
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#ffffff" },
      { media: "(prefers-color-scheme: dark)", color: info?.brand_color ?? DEFAULT_BRAND.color },
    ],
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const info = await loadBrand()
  const color = info?.brand_color ?? DEFAULT_BRAND.color
  const accent = info?.brand_accent ?? DEFAULT_BRAND.accent
  // Los colores salen del panel de administración (validados como #rrggbb).
  const brandVars = {
    "--brand": color,
    "--brand-accent": accent,
    "--brand-foreground": readableOn(color),
    "--brand-accent-foreground": readableOn(accent),
  } as React.CSSProperties

  return (
    <html
      lang="es"
      suppressHydrationWarning
      style={brandVars}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <BrandProvider logoUrl={info?.logo_url ?? null} iconUrl={info?.icon_url ?? null} iconDarkUrl={info?.icon_dark_url ?? null}>
            <TooltipProvider delay={300}>{children}</TooltipProvider>
            <Toaster position="top-center" />
          </BrandProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
