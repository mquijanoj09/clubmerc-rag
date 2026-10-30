"use client"

import { useState, useTransition } from "react"
import { Plus, X } from "lucide-react"
import { toast } from "sonner"
import { updateAssistantSettings } from "@/actions/admin"
import { Field } from "@/components/admin/field"
import { Section } from "@/components/admin/page-header"
import { SaveBar } from "@/components/admin/save-bar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { RESPONSE_LENGTHS, TONES } from "@/lib/assistant/options"
import type { AssistantSettings, ResponseLength, Tone } from "@/lib/types"
import { cn } from "@/lib/utils"

const EDITABLE = [
  "name",
  "description",
  "topic",
  "welcome_message",
  "suggested_questions",
  "tone",
  "communication_style",
  "response_length",
  "custom_instructions",
  "allowed_topics",
  "rules",
  "procedures",
  "unknown_message",
  "off_topic_message",
  "similarity_threshold",
] as const

type FormValues = Pick<AssistantSettings, (typeof EDITABLE)[number]>

function pick(s: AssistantSettings): FormValues {
  return Object.fromEntries(EDITABLE.map((k) => [k, s[k]])) as FormValues
}

export function AssistantForm({ settings }: { settings: AssistantSettings }) {
  const [saved, setSaved] = useState(() => pick(settings))
  const [values, setValues] = useState(saved)
  const [pending, startTransition] = useTransition()
  const dirty = JSON.stringify(values) !== JSON.stringify(saved)

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((v) => ({ ...v, [key]: value }))
  const text = (key: keyof FormValues) => ({
    id: key,
    value: values[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value as never),
  })

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const payload = { ...values, suggested_questions: values.suggested_questions.map((q) => q.trim()).filter(Boolean) }
    startTransition(async () => {
      const result = await updateAssistantSettings(payload)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setValues(payload)
      setSaved(payload)
      toast.success("Configuración guardada", { description: "Se aplicará en las próximas respuestas." })
    })
  }

  const questions = values.suggested_questions

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Section title="Información general" description="Cómo se presenta el asistente a los usuarios.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nombre del asistente" htmlFor="name">
            <Input {...text("name")} maxLength={60} required className="h-10" />
          </Field>
          <Field label="Tema principal" htmlFor="topic" hint="Ej.: álgebra lineal, normativa interna, soporte del producto…">
            <Input {...text("topic")} maxLength={200} required className="h-10" />
          </Field>
        </div>
        <Field label="Descripción" htmlFor="description" hint="Solo la usa la IA para entender su rol. No se muestra a los usuarios.">
          <Textarea {...text("description")} maxLength={500} rows={2} />
        </Field>
        <Field label="Mensaje de bienvenida" htmlFor="welcome_message" hint="Se muestra al iniciar una conversación y como respuesta a los saludos.">
          <Textarea {...text("welcome_message")} maxLength={500} rows={2} />
        </Field>
        <Field label="Preguntas sugeridas" hint="Hasta 6. Se muestran 4 en la pantalla de inicio del chat.">
          <div className="space-y-2">
            {questions.map((q, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  value={q}
                  maxLength={150}
                  aria-label={`Pregunta sugerida ${i + 1}`}
                  onChange={(e) => set("suggested_questions", questions.map((x, j) => (j === i ? e.target.value : x)))}
                  className="h-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Quitar pregunta"
                  onClick={() => set("suggested_questions", questions.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              </div>
            ))}
            {questions.length < 6 && (
              <Button type="button" variant="outline" size="sm" onClick={() => set("suggested_questions", [...questions, ""])}>
                <Plus /> Agregar pregunta
              </Button>
            )}
          </div>
        </Field>
      </Section>

      <Section title="Tono y personalidad" description="Define cómo se comunica el asistente.">
        <div role="radiogroup" aria-label="Tono" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(TONES) as Tone[]).map((tone) => (
            <button
              key={tone}
              type="button"
              role="radio"
              aria-checked={values.tone === tone}
              onClick={() => set("tone", tone)}
              className={cn(
                "rounded-xl border px-3.5 py-3 text-left transition-colors hover:bg-muted/60",
                values.tone === tone && "border-foreground/60 bg-muted/60 ring-1 ring-foreground/20"
              )}
            >
              <span className="text-sm font-medium">{TONES[tone].label}</span>
              <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{TONES[tone].prompt}</span>
            </button>
          ))}
        </div>

        <Field label="Longitud de respuestas">
          <div role="radiogroup" aria-label="Longitud de respuestas" className="inline-flex rounded-lg bg-muted p-1">
            {(Object.keys(RESPONSE_LENGTHS) as ResponseLength[]).map((len) => (
              <button
                key={len}
                type="button"
                role="radio"
                aria-checked={values.response_length === len}
                onClick={() => set("response_length", len)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                  values.response_length === len && "bg-background font-medium text-foreground shadow-sm"
                )}
              >
                {RESPONSE_LENGTHS[len].label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Instrucciones de comunicación" htmlFor="communication_style">
          <Textarea
            {...text("communication_style")}
            maxLength={1000}
            rows={3}
            placeholder="Responde con un tono profesional, pero cercano. Utiliza un lenguaje fácil de entender, evita respuestas demasiado extensas y explica los procedimientos paso a paso."
          />
        </Field>
      </Section>

      <Section
        title="Restricciones"
        description="Delimitan qué puede responder el asistente. Siempre responde solo con la documentación cargada."
      >
        <Field label="Temas permitidos" htmlFor="allowed_topics" hint="Si lo dejas vacío, se usa el tema principal.">
          <Textarea {...text("allowed_topics")} maxLength={1000} rows={2} placeholder="Vectores, matrices, sistemas de ecuaciones, determinantes…" />
        </Field>
        <Field label="Instrucciones que debe seguir" htmlFor="rules">
          <Textarea {...text("rules")} maxLength={4000} rows={3} placeholder="Ej.: indica siempre las unidades; no resuelvas exámenes completos…" />
        </Field>
        <Field
          label="Procedimientos que debe respetar"
          htmlFor="procedures"
          hint="Procedimientos generales. Los procedimientos detallados conviene subirlos como documentos."
        >
          <Textarea {...text("procedures")} maxLength={6000} rows={4} placeholder="Ej.: al resolver un ejercicio, primero identifica los datos, luego el método…" />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Mensaje cuando no conoce la respuesta" htmlFor="unknown_message">
            <Textarea {...text("unknown_message")} maxLength={500} rows={3} required />
          </Field>
          <Field label="Mensaje cuando la pregunta está fuera del tema" htmlFor="off_topic_message">
            <Textarea {...text("off_topic_message")} maxLength={500} rows={3} required />
          </Field>
        </div>
        <Field
          label={`Umbral de relevancia documental: ${values.similarity_threshold.toFixed(2)}`}
          htmlFor="similarity_threshold"
          hint="Similitud mínima entre la pregunta y un fragmento para usarlo. Más alto = más estricto (más respuestas «sin información»). Recomendado: 0.25 – 0.45."
        >
          <input
            id="similarity_threshold"
            type="range"
            min={0.1}
            max={0.8}
            step={0.01}
            value={values.similarity_threshold}
            onChange={(e) => set("similarity_threshold", Number(e.target.value))}
            className="w-full max-w-md accent-primary"
          />
        </Field>
      </Section>

      <Section
        title="Instrucciones personalizadas"
        description="Se combinan con las reglas generales del asistente. No pueden autorizarlo a usar información externa."
      >
        <Textarea
          {...text("custom_instructions")}
          aria-label="Instrucciones personalizadas"
          maxLength={4000}
          rows={5}
          placeholder="Ej.: al final de cada explicación, sugiere un ejercicio de la documentación para practicar."
        />
      </Section>

      <SaveBar pending={pending} dirty={dirty} />
    </form>
  )
}
