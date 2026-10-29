"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { updateAllowedDomains } from "@/actions/admin"
import { Field } from "@/components/admin/field"
import { Section } from "@/components/admin/page-header"
import { SaveBar } from "@/components/admin/save-bar"
import { Textarea } from "@/components/ui/textarea"

export function AccessForm({ domains }: { domains: string[] }) {
  const [saved, setSaved] = useState(domains.join("\n"))
  const [value, setValue] = useState(saved)
  const [pending, startTransition] = useTransition()
  const dirty = value !== saved

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await updateAllowedDomains(value.split(/[\s,;]+/).filter(Boolean))
      if (!result.ok) return void toast.error(result.error)
      const normalized = result.data.domains.join("\n")
      setValue(normalized)
      setSaved(normalized)
      toast.success(result.data.domains.length ? "Dominios guardados" : "Registro abierto a cualquier correo")
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Section
        title="Correos permitidos"
        description="Limita quién puede crear una cuenta. Se valida en la base de datos, no solo en el formulario."
      >
        <Field
          label="Dominios autorizados"
          htmlFor="domains"
          hint="Uno por línea (o separados por comas), sin @. Si lo dejas vacío, cualquier correo puede registrarse. No afecta a las cuentas que ya existen."
        >
          <Textarea id="domains" value={value} onChange={(e) => setValue(e.target.value)} rows={3} spellCheck={false} placeholder="ejemplo.com" />
        </Field>
      </Section>
      <SaveBar pending={pending} dirty={dirty} />
    </form>
  )
}
