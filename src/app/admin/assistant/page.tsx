import { AssistantForm } from "@/components/admin/assistant-form"
import { PageHeader } from "@/components/admin/page-header"
import { getSettings } from "@/lib/assistant/settings"

export default async function AssistantSettingsPage() {
  const settings = await getSettings()
  return (
    <>
      <PageHeader
        title="Configuración de la IA"
        description="Personaliza la identidad, el tono y las restricciones del asistente. Los cambios se aplican a las siguientes respuestas."
      />
      <AssistantForm settings={settings} />
    </>
  )
}
