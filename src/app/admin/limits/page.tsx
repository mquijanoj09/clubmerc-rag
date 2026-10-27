import { LimitsForm } from "@/components/admin/limits-form"
import { PageHeader } from "@/components/admin/page-header"
import { getSettings } from "@/lib/assistant/settings"

export default async function LimitsPage() {
  const settings = await getSettings()
  return (
    <>
      <PageHeader
        title="Límites y costos"
        description="Controla el consumo de OpenAI. Los cambios se aplican de inmediato a las nuevas preguntas."
      />
      <LimitsForm settings={settings} />
    </>
  )
}
