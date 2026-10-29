import { describe, expect, it } from "vitest"
import { isEmailAllowed, parseEmailDomains } from "@/lib/assistant/email-domains"
import { contrast, readableOn } from "@/lib/color"

describe("parseEmailDomains", () => {
  it("normaliza, quita @ y duplicados", () => {
    expect(parseEmailDomains("@Ejemplo.com, ejemplo.com;otra.org\nx.co")).toEqual(["ejemplo.com", "otra.org", "x.co"])
  })
  it("rechaza valores que no son dominios", () => {
    expect(() => parseEmailDomains("no es dominio")).toThrow()
    expect(() => parseEmailDomains("persona@ejemplo.com")).toThrow()
  })
})

describe("isEmailAllowed", () => {
  it("acepta todo si no hay dominios y filtra si los hay", () => {
    expect(isEmailAllowed("a@b.com", [])).toBe(true)
    expect(isEmailAllowed("A@Ejemplo.com", ["ejemplo.com"])).toBe(true)
    expect(isEmailAllowed("a@sub.ejemplo.com", ["ejemplo.com"])).toBe(false)
    expect(isEmailAllowed("a@gmail.com", ["ejemplo.com"])).toBe(false)
  })
})

describe("color", () => {
  it("elige texto legible sobre los colores de marca", () => {
    expect(readableOn("#1e293b")).toBe("#ffffff")
    expect(readableOn("#ffff00")).toBe("#0b0b2e")
    expect(contrast("#1e293b", "#ffffff")).toBeGreaterThan(10)
  })
})
