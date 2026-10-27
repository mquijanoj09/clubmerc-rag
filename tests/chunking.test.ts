import { describe, expect, it } from "vitest"
import { chunkText, normalizeText } from "@/lib/rag/chunking"

describe("chunkText", () => {
  it("devuelve un único fragmento para textos cortos", () => {
    expect(chunkText("Hola mundo.\n\nSegundo párrafo.")).toEqual(["Hola mundo.\n\nSegundo párrafo."])
  })

  it("no supera el tamaño máximo (más el solapamiento y el título)", () => {
    const text = Array.from({ length: 60 }, (_, i) => `Párrafo ${i}. ${"palabra ".repeat(30)}`).join("\n\n")
    const chunks = chunkText(text, { maxChars: 800, overlapChars: 150 })
    expect(chunks.length).toBeGreaterThan(3)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(800 + 150 + 2)
  })

  it("mantiene juntos los pasos de un procedimiento y conserva el título", () => {
    const text = `# Introducción\n\nTexto inicial.\n\n## Norma de un vector\n\nPara calcular la norma sigue estos pasos:\n\n1. Eleva cada componente al cuadrado.\n2. Suma los resultados.\n3. Calcula la raíz cuadrada de la suma.`
    const chunks = chunkText(text)
    const procedure = chunks.find((c) => c.includes("Eleva cada componente"))!
    expect(procedure).toContain("## Norma de un vector")
    expect(procedure).toContain("3. Calcula la raíz cuadrada")
    expect(chunks.some((c) => c.includes("Introducción") && c.includes("Eleva"))).toBe(false)
  })

  it("divide párrafos muy largos sin perder texto", () => {
    const sentence = "Esta es una oración de prueba. "
    const text = sentence.repeat(200)
    const chunks = chunkText(text, { maxChars: 500, overlapChars: 0 })
    expect(chunks.every((c) => c.length <= 500)).toBe(true)
    expect(chunks.join(" ").replace(/\s+/g, " ").trim()).toBe(text.trim())
  })

  it("ignora documentos vacíos", () => {
    expect(chunkText("   \n\n  ")).toEqual([])
  })

  it("normaliza saltos de línea y espacios", () => {
    expect(normalizeText("a  \r\nb\n\n\n\nc\u0000")).toBe("a\nb\n\nc")
  })
})
