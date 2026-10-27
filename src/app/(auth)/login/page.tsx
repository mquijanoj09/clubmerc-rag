import { AuthForm } from "@/components/auth/auth-form"

export const metadata = { title: "Iniciar sesión" }

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams
  return <AuthForm mode="login" initialError={error === "confirmacion" ? "El enlace de confirmación no es válido o expiró." : undefined} />
}
