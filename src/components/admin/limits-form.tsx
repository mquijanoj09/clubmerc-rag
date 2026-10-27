"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { updateLimits } from "@/actions/admin"
import { Field } from "@/components/admin/field"
import { Section } from "@/components/admin/page-header"
import { SaveBar } from "@/components/admin/save-bar"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CHAT_MODELS, chatCost, type ChatModel } from "@/lib/openai/pricing"
import type { AssistantSettings } from "@/lib/types"

type Limits = Pick<
  AssistantSettings,
  | "chat_model"
  | "monthly_free_questions"
  | "max_output_tokens"
  | "max_input_tokens"
  | "max_chunks"
  | "global_monthly_limit"
  | "monthly_budget_usd"
>

const usd = new Intl.NumberFormat("es", { style: "currency", currency: "USD", minimumFractionDigits: 4 })
const modelItems = Object.entries(CHAT_MODELS).map(([value, m]) => ({ value, label: m.label }))

export function LimitsForm({ settings }: { settings: AssistantSettings }) {
  const initial: Limits = {
    chat_model: settings.chat_model,
    monthly_free_questions: settings.monthly_free_questions,
    max_output_tokens: settings.max_output_tokens,
    max_input_tokens: settings.max_input_tokens,
    max_chunks: settings.max_chunks,
    global_monthly_limit: settings.global_monthly_limit,
    monthly_budget_usd: settings.monthly_budget_usd,
  }
  const [saved, setSaved] = useState(initial)
  const [values, setValues] = useState(initial)
  const [pending, startTransition] = useTransition()
  const dirty = JSON.stringify(values) !== JSON.stringify(saved)

  const num = (key: Exclude<keyof Limits, "chat_model">, props: { min: number; max: number; step?: number }) => ({
    id: key,
    type: "number",
    value: Number.isNaN(values[key]) ? "" : values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.valueAsNumber })),
    required: true,
    className: "h-10 tabular-nums",
    ...props,
  })

  // Costo máximo aproximado por pregunta: clasificación + respuesta con el máximo de tokens.
  const maxPerQuestion =
    chatCost(values.chat_model, values.max_input_tokens || 0, values.max_output_tokens || 0) + chatCost(values.chat_model, 2500, 200)

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await updateLimits(values)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setSaved(values)
      toast.success("Límites guardados")
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Section title="Preguntas" description="Las preguntas gratuitas se renuevan automáticamente el primer día de cada mes (UTC).">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Preguntas gratuitas mensuales por usuario" htmlFor="monthly_free_questions">
            <Input {...num("monthly_free_questions", { min: 0, max: 10000 })} />
          </Field>
          <Field
            label="Máximo global de preguntas mensuales"
            htmlFor="global_monthly_limit"
            hint="Al alcanzarlo, nadie puede hacer más preguntas hasta el próximo mes."
          >
            <Input {...num("global_monthly_limit", { min: 0, max: 1_000_000 })} />
          </Field>
        </div>
      </Section>

      <Section title="Modelo y tokens" description="El límite de entrada incluye instrucciones, documentos recuperados, historial y pregunta.">
        <Field label="Modelo de respuesta">
          <Select
            items={modelItems}
            value={values.chat_model}
            onValueChange={(value) => value && setValues((v) => ({ ...v, chat_model: value as ChatModel }))}
          >
            <SelectTrigger className="h-10 w-full max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelItems.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Máx. tokens de entrada" htmlFor="max_input_tokens">
            <Input {...num("max_input_tokens", { min: 1000, max: 30000, step: 100 })} />
          </Field>
          <Field label="Máx. tokens de salida" htmlFor="max_output_tokens">
            <Input {...num("max_output_tokens", { min: 50, max: 4000, step: 50 })} />
          </Field>
          <Field label="Máx. fragmentos recuperados" htmlFor="max_chunks">
            <Input {...num("max_chunks", { min: 1, max: 20 })} />
          </Field>
        </div>
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          Costo máximo aproximado por pregunta: <span className="font-medium text-foreground tabular-nums">{usd.format(maxPerQuestion)}</span>
        </p>
      </Section>

      <Section title="Presupuesto">
        <Field
          label="Presupuesto mensual aproximado (USD)"
          htmlFor="monthly_budget_usd"
          hint="Antes de cada consulta se comprueba de forma conservadora que el gasto estimado más el costo máximo de la consulta no supere este valor. Es una estimación, no una garantía de facturación: configura también un límite en tu cuenta de OpenAI."
        >
          <Input {...num("monthly_budget_usd", { min: 0, max: 10000, step: 0.5 })} className="h-10 max-w-48 tabular-nums" />
        </Field>
      </Section>

      <SaveBar pending={pending} dirty={dirty} />
    </form>
  )
}
