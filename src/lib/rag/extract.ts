import "server-only"

export const SUPPORTED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024

export function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? ""
}

/** Extrae el texto plano de un documento según su extensión. */
export async function extractText(buffer: Buffer, fileName: string): Promise<string> {
  const ext = fileExtension(fileName)

  if (ext === "pdf") {
    const { extractText: extractPdf, getDocumentProxy } = await import("unpdf")
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractPdf(pdf, { mergePages: false })
    return text.join("\n\n")
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth")
    const { value } = await mammoth.extractRawText({ buffer })
    return value
  }

  if (ext === "txt" || ext === "md" || ext === "markdown") {
    return buffer.toString("utf8")
  }

  throw new Error(`Formato no soportado: .${ext}`)
}
