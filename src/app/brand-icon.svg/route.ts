import { getSettings } from "@/lib/assistant/settings"
import { DEFAULT_BRAND, HEX_COLOR } from "@/lib/color"

/** Favicon por defecto (cuando no se ha subido un ícono): el destello con los colores de la marca. */
export async function GET() {
  let color: string = DEFAULT_BRAND.color
  let accent: string = DEFAULT_BRAND.accent
  try {
    const s = await getSettings()
    if (HEX_COLOR.test(s.brand_color)) color = s.brand_color
    if (HEX_COLOR.test(s.brand_accent)) accent = s.brand_accent
  } catch {
    // Sin base de datos se usan los colores por defecto.
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs>
  <rect width="64" height="64" rx="16" fill="url(#g)"/>
  <path d="M30 14l3.6 10.4L44 28l-10.4 3.6L30 42l-3.6-10.4L16 28l10.4-3.6z" fill="#fff"/>
  <path d="M45 38l1.6 4.4L51 44l-4.4 1.6L45 50l-1.6-4.4L39 44l4.4-1.6z" fill="#fff" opacity=".8"/>
</svg>`

  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300" },
  })
}
