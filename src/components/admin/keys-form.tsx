"use client"

import { useState, useTransition } from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { removeOpenAIKey, saveOpenAIKey } from "@/actions/admin"
import { Field } from "@/components/admin/field"
import { Section } from "@/components/admin/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type KeyStatus = { source: "panel" | "env" | "none"; masked: string | null }

const SOURCE_LABEL: Record<KeyStatus["source"], string> = {
  panel: "Guardada desde el panel",
  env: "Tomada de la variable de entorno OPENAI_API_KEY",
  none: "No hay ninguna clave configurada: el asistente no puede responder.",
}

export function KeysForm({ status }: { status: KeyStatus }) {
  const [current, setCurrent] = useState(status)
  const [value, setValue] = useState("")
  const [pending, startTransition] = useTransition()

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await saveOpenAIKey(value)
      if (!result.ok) return void toast.error(result.error)
      setCurrent({ source: "panel", masked: `${value.trim().slice(0, 3)}…${value.trim().slice(-4)}` })
      setValue("")
      toast.success("Clave verificada y guardada")
    })
  }

  function onRemove() {
    startTransition(async () => {
      const result = await removeOpenAIKey()
      if (!result.ok) return void toast.error(result.error)
      toast.success("Clave eliminada")
      // La página se vuelve a renderizar con el estado real (puede quedar la variable de entorno).
      window.location.reload()
    })
  }

  return (
    <Section
      title="Clave de OpenAI"
      description="Se guarda cifrada en la base de datos y nunca se envía al navegador. Tiene prioridad sobre la variable de entorno."
    >
      <p className="flex items-center gap-2 rounded-xl bg-muted/60 px-4 py-3 text-sm">
        <KeyRound className="size-4 shrink-0 text-muted-foreground" />
        <span>
          {SOURCE_LABEL[current.source]}
          {current.masked && <span className="ml-2 font-mono text-muted-foreground">{current.masked}</span>}
        </span>
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={current.source === "panel" ? "Reemplazar clave" : "Nueva clave"} htmlFor="openai_key" hint="Se comprueba con OpenAI antes de guardarla.">
          <Input
            id="openai_key"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="sk-..."
            className="h-10 max-w-md font-mono"
          />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending || value.trim().length === 0}>
            {pending && <Loader2 className="animate-spin" />}
            Verificar y guardar
          </Button>
          {current.source === "panel" && (
            <Button type="button" variant="ghost" disabled={pending} onClick={onRemove}>
              Quitar clave
            </Button>
          )}
        </div>
      </form>
      <p className="text-xs text-muted-foreground">
        Las claves de Supabase (URL, anon y service role) siguen en las variables de entorno: son las que permiten conectarse a esta misma base de datos.
      </p>
    </Section>
  )
}
