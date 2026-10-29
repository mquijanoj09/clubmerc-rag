"use client"

import { useRef, useState, useTransition } from "react"
import { ImagePlus, Loader2, Trash2 } from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { removeBrandImage, updateBrand, uploadBrandImage, type BrandImage } from "@/actions/admin"
import { Field } from "@/components/admin/field"
import { Section } from "@/components/admin/page-header"
import { SaveBar } from "@/components/admin/save-bar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { HEX_COLOR, contrast, readableOn } from "@/lib/color"
import type { AssistantSettings } from "@/lib/types"
import { cn } from "@/lib/utils"

type Colors = Pick<AssistantSettings, "brand_color" | "brand_accent">

function ColorField({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const valid = HEX_COLOR.test(value)
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (selector)`}
          value={valid ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="size-10 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          maxLength={7}
          spellCheck={false}
          aria-invalid={!valid}
          className="h-10 max-w-36 font-mono uppercase"
        />
      </div>
    </Field>
  )
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("No se pudo leer la imagen."))
    }
    img.src = url
  })
}

/**
 * Prepara el ícono para usarse a 16–56 px: recorta los bordes vacíos (transparentes
 * o blancos), lo centra en un cuadrado con un margen pequeño y lo exporta a 512×512.
 * Si algo falla, se sube la imagen original.
 */
async function normalizeIcon(file: File): Promise<File> {
  try {
    const img = await loadImage(file)
    const w = img.naturalWidth || 512
    const h = img.naturalHeight || 512
    const source = document.createElement("canvas")
    source.width = w
    source.height = h
    const sctx = source.getContext("2d", { willReadFrequently: true })
    if (!sctx) return file
    sctx.drawImage(img, 0, 0, w, h)

    const { data } = sctx.getImageData(0, 0, w, h)
    // El blanco solo es «vacío» si el fondo es blanco opaco (esquina superior izquierda);
    // así un ícono blanco sobre fondo transparente no se descarta.
    const whiteBackground = data[3] >= 16 && data[0] > 245 && data[1] > 245 && data[2] > 245
    let [minX, minY, maxX, maxY] = [w, h, -1, -1]
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const empty = data[i + 3] < 16 || (whiteBackground && data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245)
        if (empty) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    if (maxX < 0) return file

    const cropW = maxX - minX + 1
    const cropH = maxY - minY + 1
    const SIZE = 512
    const inner = SIZE * 0.86 // ~7 % de margen por lado
    const scale = inner / Math.max(cropW, cropH)
    const out = document.createElement("canvas")
    out.width = SIZE
    out.height = SIZE
    const octx = out.getContext("2d")
    if (!octx) return file
    octx.imageSmoothingQuality = "high"
    const dw = cropW * scale
    const dh = cropH * scale
    octx.drawImage(source, minX, minY, cropW, cropH, (SIZE - dw) / 2, (SIZE - dh) / 2, dw, dh)

    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/png"))
    return blob ? new File([blob], "icon.png", { type: "image/png" }) : file
  } catch {
    return file
  }
}

const IMAGE_COPY: Record<BrandImage, { title: string; hint: string; previewClass: string }> = {
  icon: {
    title: "Ícono",
    hint: "Solo el símbolo, sin texto. Se recorta y centra automáticamente. Se usa como favicon y como avatar del asistente.",
    previewClass: "size-16",
  },
  logo: {
    title: "Logo",
    hint: "Horizontal, con el nombre de la marca. Se muestra en el inicio de sesión y el registro.",
    previewClass: "h-16 w-44",
  },
}

function BrandImageField({ kind, initialUrl }: { kind: BrandImage; initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl)
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const copy = IMAGE_COPY[kind]

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const upload = kind === "icon" ? await normalizeIcon(file) : file
    const body = new FormData()
    body.set("file", upload)
    startTransition(async () => {
      const result = await uploadBrandImage(kind, body)
      if (!result.ok) return void toast.error(result.error)
      setUrl(result.data.url)
      toast.success(`${copy.title} actualizado`)
    })
  }

  function onRemove() {
    startTransition(async () => {
      const result = await removeBrandImage(kind)
      if (!result.ok) return void toast.error(result.error)
      setUrl(null)
      toast.success(`${copy.title} eliminado`)
    })
  }

  return (
    <Field label={copy.title} hint={`${copy.hint} PNG, JPG, WebP o SVG, máximo 512 KB.`}>
      <div className="flex flex-wrap items-center gap-4">
        <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-white", copy.previewClass)}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa de la imagen subida
            <img src={url} alt={`${copy.title} actual`} className={cn("size-full object-contain", kind === "logo" && "p-1.5")} />
          ) : (
            <ImagePlus className="size-6 text-slate-400" />
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onFile} className="hidden" />
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => fileRef.current?.click()}>
            {pending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {url ? "Cambiar" : "Subir"}
          </Button>
          {url && (
            <Button type="button" variant="ghost" disabled={pending} onClick={onRemove}>
              <Trash2 /> Quitar
            </Button>
          )}
        </div>
      </div>
    </Field>
  )
}

export function BrandForm({ settings }: { settings: AssistantSettings }) {
  const initial: Colors = { brand_color: settings.brand_color, brand_accent: settings.brand_accent }
  const [saved, setSaved] = useState(initial)
  const [values, setValues] = useState(initial)
  const [pending, startTransition] = useTransition()
  const dirty = JSON.stringify(values) !== JSON.stringify(saved)
  const valid = HEX_COLOR.test(values.brand_color) && HEX_COLOR.test(values.brand_accent)
  const lowContrast = HEX_COLOR.test(values.brand_color) && contrast(values.brand_color, "#ffffff") < 4.5

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return toast.error("Los colores deben tener el formato #rrggbb.")
    startTransition(async () => {
      const result = await updateBrand(values)
      if (!result.ok) return void toast.error(result.error)
      setSaved(values)
      toast.success("Colores guardados")
    })
  }

  const primary = valid ? values.brand_color : saved.brand_color
  const accent = valid ? values.brand_accent : saved.brand_accent
  // Igual que la app: en tema oscuro el botón principal usa el color de acento.
  const dark = useTheme().resolvedTheme === "dark"
  const button = dark ? accent : primary

  return (
    <div className="space-y-4">
      <Section title="Logo e ícono" description="Si no subes un ícono, se usa uno genérico con los colores de la marca.">
        <BrandImageField kind="icon" initialUrl={settings.icon_url} />
        <BrandImageField kind="logo" initialUrl={settings.logo_url} />
      </Section>

      <form onSubmit={onSubmit} className="space-y-4">
        <Section title="Colores" description="Toda la interfaz se deriva de estos dos colores.">
          <div className="grid gap-5 sm:grid-cols-2">
            <ColorField
              id="brand_color"
              label="Color principal"
              hint="Botones, enlaces y elementos de énfasis. Conviene un tono oscuro para que el texto blanco se lea bien."
              value={values.brand_color}
              onChange={(v) => setValues((s) => ({ ...s, brand_color: v }))}
            />
            <ColorField
              id="brand_accent"
              label="Color de acento"
              hint="Foco de los campos, bordes suaves y degradados."
              value={values.brand_accent}
              onChange={(v) => setValues((s) => ({ ...s, brand_accent: v }))}
            />
          </div>
          {lowContrast && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
              El color principal es muy claro: los textos y botones pueden costar de leer sobre fondo blanco.
            </p>
          )}

          <div className="space-y-3 rounded-xl border bg-background p-4 text-foreground">
            <p className="text-xs font-medium text-muted-foreground">Vista previa ({dark ? "tema oscuro" : "tema claro"})</p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="size-9 rounded-xl shadow-sm" style={{ backgroundImage: `linear-gradient(135deg, ${primary}, ${accent})` }} />
              <button
                type="button"
                className="h-9 rounded-lg px-4 text-sm font-medium"
                style={{ backgroundColor: button, color: readableOn(button) }}
              >
                Botón principal
              </button>
              <span
                className="inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm text-foreground"
                style={{ borderColor: accent, boxShadow: `0 0 0 3px ${accent}40` }}
              >
                Campo enfocado
              </span>
            </div>
          </div>
        </Section>
        <SaveBar pending={pending} dirty={dirty && valid} />
      </form>
    </div>
  )
}
