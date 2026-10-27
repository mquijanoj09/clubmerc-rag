export interface ChunkOptions {
  /** Tamaño máximo aproximado de cada fragmento, en caracteres. */
  maxChars?: number
  /** Texto del fragmento anterior que se repite al inicio del siguiente. */
  overlapChars?: number
}

const HEADING = /^#{1,6}\s+(.+)$/

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function splitLongBlock(block: string, maxChars: number): string[] {
  const sentences = block.split(/(?<=[.!?:;])\s+/)
  const parts: string[] = []
  let current = ""
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) parts.push(current)
      current = ""
      for (let i = 0; i < sentence.length; i += maxChars) parts.push(sentence.slice(i, i + maxChars))
      continue
    }
    if (current && current.length + sentence.length + 1 > maxChars) {
      parts.push(current)
      current = sentence
    } else {
      current = current ? `${current} ${sentence}` : sentence
    }
  }
  if (current) parts.push(current)
  return parts
}

function tail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const slice = text.slice(-maxChars)
  const boundary = slice.search(/[.!?\n]\s/)
  return boundary >= 0 ? slice.slice(boundary + 2) : slice
}

/**
 * Divide el texto por párrafos y los agrupa hasta `maxChars`. Los párrafos
 * consecutivos (por ejemplo, los pasos de un procedimiento) se mantienen
 * juntos siempre que quepan, y cada fragmento conserva el último título
 * Markdown como contexto.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? 1500
  const overlapChars = options.overlapChars ?? 200
  const blocks = normalizeText(text)
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let heading = ""
  let current = ""
  let currentHasBody = false

  const flush = () => {
    if (currentHasBody) chunks.push(current.trim())
    current = currentHasBody && overlapChars > 0 ? tail(current, overlapChars) : ""
    currentHasBody = false
  }

  for (const block of blocks) {
    const headingMatch = block.match(HEADING)
    if (headingMatch && !block.includes("\n")) {
      // Un título nuevo inicia un fragmento nuevo para no mezclar secciones.
      if (currentHasBody) flush()
      heading = block
      current = heading
      continue
    }

    const pieces = block.length > maxChars ? splitLongBlock(block, maxChars) : [block]
    for (const piece of pieces) {
      if (currentHasBody && current.length + piece.length + 2 > maxChars) {
        flush()
        if (heading && !current.startsWith(heading)) current = current ? `${heading}\n\n${current}` : heading
      }
      current = current ? `${current}\n\n${piece}` : piece
      currentHasBody = true
    }
  }
  if (currentHasBody) chunks.push(current.trim())

  return chunks
}
