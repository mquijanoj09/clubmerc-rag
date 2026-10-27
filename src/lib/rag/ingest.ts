import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { embed } from "@/lib/openai/client"
import { EMBEDDING_MODEL, embeddingCost } from "@/lib/openai/pricing"
import { logUsage } from "@/lib/openai/usage"
import { chunkText } from "@/lib/rag/chunking"
import { extractText, MAX_FILE_BYTES } from "@/lib/rag/extract"

const MAX_CHUNKS_PER_DOCUMENT = 800

/**
 * Procesa un documento ya subido a Storage: extrae el texto, lo fragmenta,
 * genera embeddings y guarda los fragmentos. Marca el documento como
 * `ready` o `error`.
 */
export async function ingestDocument(documentId: string, adminId: string): Promise<void> {
  const supabase = createAdminClient()

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id, name, storage_path")
    .eq("id", documentId)
    .single()
  if (docError || !doc) throw new Error("Documento no encontrado.")

  await supabase.from("documents").update({ status: "processing", error: null }).eq("id", documentId)

  try {
    const { data: file, error: downloadError } = await supabase.storage.from("documents").download(doc.storage_path)
    if (downloadError || !file) throw new Error("No se pudo descargar el archivo desde Storage.")
    if (file.size > MAX_FILE_BYTES) throw new Error("El archivo supera el tamaño máximo de 10 MB.")

    const buffer = Buffer.from(await file.arrayBuffer())
    const text = await extractText(buffer, doc.name)
    const chunks = chunkText(text)
    if (chunks.length === 0) {
      throw new Error("No se encontró texto en el documento. Si es un PDF escaneado, conviértelo a texto primero.")
    }
    if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
      throw new Error(`El documento es demasiado extenso (${chunks.length} fragmentos). Divídelo en archivos más pequeños.`)
    }

    // El nombre del documento se incluye en el texto embebido para mejorar la búsqueda.
    const { vectors, tokens } = await embed(chunks.map((c) => `${doc.name}\n\n${c}`))
    await logUsage({
      userId: adminId,
      kind: "embedding_document",
      model: EMBEDDING_MODEL,
      inputTokens: tokens,
      costUsd: embeddingCost(tokens),
    })

    // Reemplaza fragmentos anteriores (reprocesamiento).
    await supabase.from("document_chunks").delete().eq("document_id", documentId)

    const rows = chunks.map((content, i) => ({
      document_id: documentId,
      chunk_index: i,
      content,
      embedding: JSON.stringify(vectors[i]),
    }))
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from("document_chunks").insert(rows.slice(i, i + 100))
      if (error) throw new Error(`No se pudieron guardar los fragmentos: ${error.message}`)
    }

    await supabase
      .from("documents")
      .update({ status: "ready", chunk_count: chunks.length, error: null })
      .eq("id", documentId)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido al procesar el documento."
    await supabase.from("document_chunks").delete().eq("document_id", documentId)
    await supabase
      .from("documents")
      .update({ status: "error", error: message.slice(0, 500), chunk_count: 0 })
      .eq("id", documentId)
    throw err
  }
}
