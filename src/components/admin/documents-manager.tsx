"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileText, Loader2, RotateCw, Trash2, UploadCloud } from "lucide-react"
import { toast } from "sonner"
import { createDocumentUpload, deleteDocument } from "@/actions/admin"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { createClient } from "@/lib/supabase/client"
import type { DocumentRow, DocumentStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const ACCEPT = ".pdf,.docx,.txt,.md,.markdown"
const MAX_BYTES = 10 * 1024 * 1024

const STATUS: Record<DocumentStatus, { label: string; className: string }> = {
  pending: { label: "Subiendo", className: "bg-muted text-muted-foreground" },
  processing: { label: "Procesando", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  ready: { label: "Disponible", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  error: { label: "Error", className: "bg-destructive/10 text-destructive" },
}

const dateFormat = new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" })

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function processDocument(id: string) {
  const res = await fetch(`/api/admin/documents/${id}/process`, { method: "POST" })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? "No se pudo procesar el documento.")
}

export function DocumentsManager({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busyIds, setBusyIds] = useState<Record<string, DocumentStatus>>({})
  const [uploading, setUploading] = useState<string[]>([])
  const [toDelete, setToDelete] = useState<DocumentRow | null>(null)
  const [deleting, startDelete] = useTransition()

  const setBusy = (id: string, status: DocumentStatus | null) =>
    setBusyIds((b) => {
      const next = { ...b }
      if (status) next[id] = status
      else delete next[id]
      return next
    })

  async function uploadFile(file: File) {
    if (file.size > MAX_BYTES) {
      toast.error(`«${file.name}» supera el máximo de 10 MB.`)
      return
    }
    setUploading((u) => [...u, file.name])
    let documentId: string | null = null
    try {
      const prepared = await createDocumentUpload({ name: file.name, size: file.size })
      if (!prepared.ok) throw new Error(prepared.error)
      documentId = prepared.data.documentId

      const { error } = await createClient()
        .storage.from("documents")
        .uploadToSignedUrl(prepared.data.path, prepared.data.token, file, { contentType: file.type || undefined })
      if (error) throw new Error("No se pudo subir el archivo.")

      setUploading((u) => u.filter((n) => n !== file.name))
      router.refresh()
      setBusy(documentId, "processing")
      await processDocument(documentId)
      toast.success(`«${file.name}» está disponible.`)
    } catch (err) {
      toast.error(`«${file.name}»: ${(err as Error).message}`)
    } finally {
      setUploading((u) => u.filter((n) => n !== file.name))
      if (documentId) setBusy(documentId, null)
      router.refresh()
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    // Secuencial: evita superar los límites de frecuencia de OpenAI con varios archivos.
    for (const file of Array.from(files)) await uploadFile(file)
    if (inputRef.current) inputRef.current.value = ""
  }

  async function reprocess(doc: DocumentRow) {
    setBusy(doc.id, "processing")
    try {
      await processDocument(doc.id)
      toast.success(`«${doc.name}» está disponible.`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(doc.id, null)
      router.refresh()
    }
  }

  function confirmDelete() {
    if (!toDelete) return
    const target = toDelete
    startDelete(async () => {
      const result = await deleteDocument(target.id)
      if (!result.ok) toast.error(result.error)
      else toast.success("Documento eliminado.")
      setToDelete(null)
      router.refresh()
    })
  }

  const totalChunks = documents.reduce((sum, d) => sum + d.chunk_count, 0)

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors hover:border-foreground/30 hover:bg-muted/40",
          dragging && "border-foreground/40 bg-muted/60"
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-muted">
          <UploadCloud className="size-5 text-muted-foreground" />
        </span>
        <span className="mt-3 text-sm font-medium">Arrastra archivos aquí o haz clic para seleccionarlos</span>
        <span className="mt-1 text-xs text-muted-foreground">PDF, DOCX, TXT o Markdown · máximo 10 MB por archivo</span>
      </button>
      <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => handleFiles(e.target.files)} />

      {uploading.length > 0 && (
        <div className="space-y-1.5">
          {uploading.map((name) => (
            <div key={name} className="flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 text-sm animate-in fade-in-0">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              Subiendo «{name}»…
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        <div className="flex items-center justify-between border-b px-5 py-3 text-sm">
          <span className="font-medium">{documents.length} documentos</span>
          <span className="text-muted-foreground tabular-nums">{totalChunks} fragmentos indexados</span>
        </div>
        {documents.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <FileText className="size-8 text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium">Aún no hay documentos</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Sube los materiales, instrucciones y procedimientos que el asistente debe usar para responder.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {documents.map((doc) => {
              const status = busyIds[doc.id] ?? doc.status
              const isBusy = status === "processing" || status === "pending"
              return (
                <li key={doc.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-[0.6rem] font-semibold text-muted-foreground uppercase">
                    {doc.name.split(".").pop()?.slice(0, 4)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {formatSize(doc.size_bytes)} · {dateFormat.format(new Date(doc.created_at))}
                      {status === "ready" && ` · ${doc.chunk_count} fragmentos`}
                    </p>
                    {status === "error" && doc.error && <p className="mt-1 text-xs text-destructive">{doc.error}</p>}
                  </div>
                  <Badge className={cn("gap-1", STATUS[status].className)}>
                    {isBusy && <Loader2 className="size-3 animate-spin" />}
                    {STATUS[status].label}
                  </Badge>
                  <div className="flex shrink-0">
                    {(status === "error" || status === "pending") && !busyIds[doc.id] && (
                      <Tooltip>
                        <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Reintentar" onClick={() => reprocess(doc)} />}>
                          <RotateCw />
                        </TooltipTrigger>
                        <TooltipContent>Reintentar procesamiento</TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Eliminar"
                            disabled={Boolean(busyIds[doc.id])}
                            onClick={() => setToDelete(doc)}
                            className="text-muted-foreground hover:text-destructive"
                          />
                        }
                      >
                        <Trash2 />
                      </TooltipTrigger>
                      <TooltipContent>Eliminar</TooltipContent>
                    </Tooltip>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              «{toDelete?.name}» y sus fragmentos dejarán de estar disponibles para el asistente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete} disabled={deleting}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
