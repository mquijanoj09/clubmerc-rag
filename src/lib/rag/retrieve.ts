import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

export interface RetrievedChunk {
  id: number
  document_id: string
  document_name: string
  chunk_index: number
  content: string
  similarity: number
}

/** Búsqueda vectorial en pgvector, siempre ejecutada desde el backend. */
export async function searchChunks(
  embedding: number[],
  matchCount: number,
  minSimilarity: number
): Promise<RetrievedChunk[]> {
  const { data, error } = await createAdminClient().rpc("match_chunks", {
    query_embedding: JSON.stringify(embedding),
    match_count: matchCount,
    min_similarity: minSimilarity,
  })
  if (error) throw new Error(`Error en la búsqueda documental: ${error.message}`)
  return (data ?? []) as RetrievedChunk[]
}
