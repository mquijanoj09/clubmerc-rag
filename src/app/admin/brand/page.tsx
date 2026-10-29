import { AccessForm } from "@/components/admin/access-form"
import { BrandForm } from "@/components/admin/brand-form"
import { KeysForm, type KeyStatus } from "@/components/admin/keys-form"
import { PageHeader } from "@/components/admin/page-header"
import { getSettings } from "@/lib/assistant/settings"
import { getSecret, maskSecret } from "@/lib/secrets"

async function openaiKeyStatus(): Promise<KeyStatus> {
  const stored = await getSecret("openai_api_key")
  if (stored) return { source: "panel", masked: maskSecret(stored) }
  return { source: process.env.OPENAI_API_KEY ? "env" : "none", masked: null }
}

export default async function BrandPage() {
  const [settings, keyStatus] = await Promise.all([getSettings(), openaiKeyStatus()])
  return (
    <>
      <PageHeader
        title="Marca y acceso"
        description="Logo, colores, quién puede registrarse y claves. Todo se guarda en la base de datos, así que el mismo código sirve para cualquier proyecto."
      />
      <div className="space-y-4">
        <BrandForm settings={settings} />
        <AccessForm domains={settings.allowed_email_domains} />
        <KeysForm status={keyStatus} />
      </div>
    </>
  )
}
