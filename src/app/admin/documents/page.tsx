import { DocumentsManager } from "@/components/admin/documents-manager"
import { PageHeader } from "@/components/admin/page-header"
import { createAdminClient } from "@/lib/supabase/admin"
import type { DocumentRow } from "@/lib/types"

export default async function DocumentsPage() {
  const { data } = await createAdminClient()
    .from("documents")
    .select("id, name, storage_path, mime_type, size_bytes, status, error, chunk_count, created_at")
    .order("created_at", { ascending: false })

  return (
    <>
      <PageHeader
        title="Documentos"
        description="Base de conocimiento del asistente. Solo responde con la información de los documentos disponibles."
      />
      <DocumentsManager documents={(data ?? []) as DocumentRow[]} />
    </>
  )
}
