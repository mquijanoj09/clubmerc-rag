"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { isEmailAllowed } from "@/lib/assistant/email-domains"
import { createClient } from "@/lib/supabase/client"

const ERRORS: Record<string, string> = {
  "Invalid login credentials": "Correo o contraseña incorrectos.",
  "Email not confirmed": "Debes confirmar tu correo antes de iniciar sesión.",
  "User already registered": "Ya existe una cuenta con este correo.",
}

const domainMessage = (domains: string[]) =>
  `Solo pueden registrarse correos de: ${domains.map((d) => `@${d}`).join(", ")}.`

function translate(message: string, domains: string[]) {
  // El disparador de la base de datos rechaza dominios no autorizados.
  if (message.includes("Database error saving new user") && domains.length) return domainMessage(domains)
  if (message.toLowerCase().includes("rate limit")) return "Demasiados intentos. Espera unos minutos."
  if (message.toLowerCase().includes("password")) return "La contraseña debe tener al menos 6 caracteres."
  return ERRORS[message] ?? "No se pudo completar la operación. Inténtalo de nuevo."
}

export function AuthForm({
  mode,
  initialError,
  allowedDomains = [],
}: {
  mode: "login" | "register"
  initialError?: string
  allowedDomains?: string[]
}) {
  const router = useRouter()
  const [error, setError] = useState(initialError ?? "")
  const [loading, setLoading] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const isLogin = mode === "login"

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get("email")).trim()
    const password = String(form.get("password"))
    const fullName = String(form.get("fullName") ?? "").trim()

    setError("")
    setLoading(true)
    const supabase = createClient()

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(translate(error.message, allowedDomains))
        setLoading(false)
        return
      }
    } else {
      if (!isEmailAllowed(email, allowedDomains)) {
        setError(domainMessage(allowedDomains))
        setLoading(false)
        return
      }
      if (password.length < 8) {
        setError("La contraseña debe tener al menos 8 caracteres.")
        setLoading(false)
        return
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        setError(translate(error.message, allowedDomains))
        setLoading(false)
        return
      }
      if (!data.session) {
        // El proyecto de Supabase exige confirmar el correo.
        setConfirmEmail(email)
        setLoading(false)
        return
      }
    }

    router.replace("/chat")
    router.refresh()
  }

  if (confirmEmail) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center shadow-sm animate-in fade-in-0 zoom-in-95">
        <MailCheck className="mx-auto size-8 text-muted-foreground" />
        <h2 className="mt-3 font-medium">Revisa tu correo</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enviamos un enlace de confirmación a <span className="font-medium text-foreground">{confirmEmail}</span>.
          Ábrelo para activar tu cuenta.
        </p>
        <Button variant="outline" className="mt-5 w-full" render={<Link href="/login" />} nativeButton={false}>
          Volver a iniciar sesión
        </Button>
      </div>
    )
  }

  return (
    // En escritorio el formulario va sin tarjeta: el panel de marca ya enmarca la pantalla.
    <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
      <h1 className="text-2xl font-semibold tracking-tight">{isLogin ? "Bienvenido de nuevo" : "Crea tu cuenta"}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {isLogin ? "Ingresa con tu correo y contraseña para continuar." : "Regístrate para empezar a hacer preguntas."}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        {!isLogin && (
          <div className="space-y-2">
            <Label htmlFor="fullName">Nombre</Label>
            <Input id="fullName" name="fullName" autoComplete="name" placeholder="Tu nombre" maxLength={100} className="h-11" />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" placeholder={!isLogin && allowedDomains[0] ? `tu@${allowedDomains[0]}` : "tu@correo.com"} className="h-11" />
          {!isLogin && allowedDomains.length > 0 && (
            <p className="text-xs text-muted-foreground">{domainMessage(allowedDomains)}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={isLogin ? 6 : 8}
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder={isLogin ? "••••••••" : "Mínimo 8 caracteres"}
              className="h-11 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive animate-in fade-in-0">
            {error}
          </p>
        )}

        <Button type="submit" className="h-11 w-full text-[0.95rem]" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          {isLogin ? "Iniciar sesión" : "Crear cuenta"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground lg:text-left">
        {isLogin ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
        <Link href={isLogin ? "/register" : "/login"} className="font-medium text-foreground underline-offset-4 hover:underline">
          {isLogin ? "Regístrate" : "Inicia sesión"}
        </Link>
      </p>
    </div>
  )
}
