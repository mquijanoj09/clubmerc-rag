import type { ResponseLength, Tone } from "@/lib/types"

export const TONES: Record<Tone, { label: string; prompt: string }> = {
  formal: {
    label: "Formal",
    prompt: "Usa un registro formal y respetuoso (trato de usted), con vocabulario preciso y sin coloquialismos.",
  },
  profesional: {
    label: "Profesional",
    prompt: "Usa un tono profesional, claro y directo, cordial pero sin excesos de familiaridad.",
  },
  amigable: {
    label: "Amigable",
    prompt: "Usa un tono cálido y cercano (trato de tú), motivador y paciente.",
  },
  educativo: {
    label: "Educativo",
    prompt:
      "Actúa como un docente: explica el porqué de cada paso, usa ejemplos de la documentación y comprueba la comprensión con preguntas breves cuando sea útil.",
  },
  tecnico: {
    label: "Técnico",
    prompt: "Usa terminología técnica precisa, notación correcta y explicaciones rigurosas y concisas.",
  },
  casual: {
    label: "Casual",
    prompt: "Usa un tono relajado y conversacional, con frases sencillas, sin perder la exactitud.",
  },
}

export const RESPONSE_LENGTHS: Record<ResponseLength, { label: string; prompt: string }> = {
  corta: { label: "Corta", prompt: "Responde de forma breve: idealmente 1 a 3 frases o una lista corta." },
  media: { label: "Media", prompt: "Responde con una extensión moderada: lo necesario para ser claro, sin rodeos." },
  detallada: {
    label: "Detallada",
    prompt: "Responde de forma completa y detallada, desarrollando cada paso y aclarando los conceptos implicados.",
  },
}
