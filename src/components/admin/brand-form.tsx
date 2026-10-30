"use client"

import { useRef, useState, useTransition } from "react"
import { ImagePlus, Loader2, Trash2 } from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import {
  commitBrandImage,
  createBrandUpload,
  removeBrandImage,
  updateAuthMessage,
  updateBrand,
  type BrandImage,
} from "@/actions/admin"
import { Field } from "@/components/admin/field"
import { Section } from "@/components/admin/page-header"
import { SaveBar } from "@/components/admin/save-bar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { HEX_COLOR, contrast, readableOn } from "@/lib/color"
import { createClient } from "@/lib/supabase/client"
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

/** Reduce fotografías grandes (máx. 2400 px de ancho, WebP) para que la pantalla de inicio cargue rápido. */
async function shrinkPhoto(file: File): Promise<File> {
  if (file.type === "image/svg+xml") return file
  try {
    const img = await loadImage(file)
    const MAX_W = 2400
    if (img.naturalWidth <= MAX_W && file.size <= 1.5 * 1024 * 1024) return file
    const scale = Math.min(1, MAX_W / img.naturalWidth)
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) return file
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85))
    return blob && blob.size < file.size ? new File([blob], "auth.webp", { type: "image/webp" }) : file
  } catch {
    return file
  }
}

const IMAGE_COPY: Record<
  BrandImage,
  { title: string; hint: string; previewClass: string; previewBg?: string; prepare?: (f: File) => Promise<File> }
> = {
  icon: {
    title: "Isotipo (tema claro)",
    hint: "Solo el símbolo, sin texto y con fondo transparente. Se recorta y centra automáticamente. Se usa como favicon, avatar del asistente y en el fondo de la pantalla de inicio. Máximo 512 KB.",
    previewClass: "size-16",
    prepare: normalizeIcon,
  },
  icon_dark: {
    title: "Isotipo (tema oscuro)",
    hint: "Versión para fondos oscuros. Si no lo subes, se usa el isotipo claro. Máximo 512 KB.",
    previewClass: "size-16",
    previewBg: "bg-slate-900",
    prepare: normalizeIcon,
  },
  logo: {
    title: "Logo (tema claro)",
    hint: "Horizontal, con el nombre de la marca, para fondos claros. Se muestra en la pantalla de inicio de sesión. Máximo 512 KB.",
    previewClass: "h-16 w-44",
  },
  logo_dark: {
    title: "Logo (tema oscuro)",
    hint: "Versión para fondos oscuros (normalmente en blanco). Se usa en el tema oscuro y sobre la imagen de inicio. Si no lo subes, el logo claro se muestra sobre un recuadro blanco. Máximo 512 KB.",
    previewClass: "h-16 w-44",
    previewBg: "bg-slate-900",
  },
  auth_image: {
    title: "Imagen de inicio de sesión",
    hint: "Ocupa la mitad izquierda de la pantalla de inicio en computador. Horizontal o vertical, idealmente de al menos 1600 px. Si no la subes, se muestra un fondo con los colores y el ícono de la marca. Máximo 5 MB.",
    previewClass: "h-24 w-40",
    prepare: shrinkPhoto,
  },
}

function BrandImageField({ kind, initialUrl }: { kind: BrandImage; initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl)
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const copy = IMAGE_COPY[kind]

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    startTransition(async () => {
      const upload = copy.prepare ? await copy.prepare(file) : file
      const prepared = await createBrandUpload(kind, { type: upload.type, size: upload.size })
      if (!prepared.ok) return void toast.error(prepared.error)

      const { error } = await createClient()
        .storage.from("branding")
        .uploadToSignedUrl(prepared.data.path, prepared.data.token, upload, { contentType: upload.type })
      if (error) return void toast.error("No se pudo subir la imagen.")

      const result = await commitBrandImage(kind, prepared.data.path)
      if (!result.ok) return void toast.error(result.error)
      setUrl(result.data.url)
      toast.success(`${copy.title}: actualizado`)
    })
  }

  function onRemove() {
    startTransition(async () => {
      const result = await removeBrandImage(kind)
      if (!result.ok) return void toast.error(result.error)
      setUrl(null)
      toast.success(`${copy.title}: eliminado`)
    })
  }

  return (
    <Field label={copy.title} hint={`${copy.hint} PNG, JPG, WebP o SVG.`}>
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border",
            copy.previewBg ?? "bg-white",
            copy.previewClass
          )}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- vista previa de la imagen subida
            <img
              src={url}
              alt={`${copy.title} actual`}
              className={cn(
                "size-full",
                kind === "auth_image" ? "object-cover" : "object-contain",
                kind === "auth_image" ? "" : kind.startsWith("logo") ? "p-2" : "p-1.5"
              )}
            />
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

function AuthMessageField({ initial }: { initial: string }) {
  const [saved, setSaved] = useState(initial)
  const [value, setValue] = useState(initial)
  const [pending, startTransition] = useTransition()
  const dirty = value.trim() !== saved

  function onSave() {
    startTransition(async () => {
      const result = await updateAuthMessage(value)
      if (!result.ok) return void toast.error(result.error)
      setSaved(value.trim())
      setValue(value.trim())
      toast.success(value.trim() ? "Mensaje de inicio guardado" : "Mensaje de inicio eliminado")
    })
  }

  return (
    <Field
      label="Mensaje de inicio"
      htmlFor="auth_message"
      hint={`Se muestra junto al nombre en la pantalla de inicio de sesión y registro. Déjalo vacío para no mostrar ninguno. ${value.length}/300`}
    >
      <Textarea
        id="auth_message"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={300}
        rows={2}
        placeholder="Ej.: Resuelve tus dudas al instante con la información oficial."
      />
      <Button type="button" variant="outline" size="sm" disabled={pending || !dirty} onClick={onSave}>
        {pending && <Loader2 className="animate-spin" />}
        Guardar mensaje
      </Button>
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
      <Section title="Isotipo y logo" description="Si no subes un isotipo, se usa uno genérico con los colores de la marca.">
        <div className="grid gap-5 sm:grid-cols-2">
          <BrandImageField kind="icon" initialUrl={settings.icon_url} />
          <BrandImageField kind="icon_dark" initialUrl={settings.icon_dark_url} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <BrandImageField kind="logo" initialUrl={settings.logo_url} />
          <BrandImageField kind="logo_dark" initialUrl={settings.logo_dark_url} />
        </div>
      </Section>

      <Section title="Pantalla de inicio de sesión" description="Lo primero que ven los usuarios antes de entrar.">
        <AuthMessageField initial={settings.auth_message} />
        <BrandImageField kind="auth_image" initialUrl={settings.auth_image_url} />
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
