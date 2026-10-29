export const HEX_COLOR = /^#[0-9a-f]{6}$/i

export const DEFAULT_BRAND = { color: "#1e293b", accent: "#64748b" } as const

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Razón de contraste WCAG entre dos colores hexadecimales (1 a 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Blanco u oscuro, según cuál se lea mejor sobre el color dado. */
export function readableOn(hex: string): string {
  return contrast(hex, "#ffffff") >= contrast(hex, "#0b0b2e") ? "#ffffff" : "#0b0b2e"
}
