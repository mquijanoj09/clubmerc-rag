import { AuthForm } from "@/components/auth/auth-form"
import { getPublicAssistantInfo } from "@/lib/assistant/settings"

export const metadata = { title: "Crear cuenta" }

export default async function RegisterPage() {
  const { allowed_email_domains } = await getPublicAssistantInfo()
  return <AuthForm mode="register" allowedDomains={allowed_email_domains} />
}
