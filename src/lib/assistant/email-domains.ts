const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/

/** Convierte «@Ejemplo.com, otra.org» en ["ejemplo.com", "otra.org"]. Lanza si algún valor no es un dominio. */
export function parseEmailDomains(raw: string | string[]): string[] {
  const items = (Array.isArray(raw) ? raw : raw.split(/[\s,;]+/))
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean)
  for (const d of items) {
    if (!DOMAIN.test(d)) throw new Error(`«${d}» no es un dominio válido (ejemplo: ejemplo.com).`)
  }
  return [...new Set(items)]
}

/** Sin dominios configurados se acepta cualquier correo. */
export function isEmailAllowed(email: string, domains: string[]): boolean {
  if (domains.length === 0) return true
  return domains.includes(email.trim().toLowerCase().split("@").pop() ?? "")
}
