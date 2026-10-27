"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Loader2, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"

const ERRORS: Record<string, string> = {
  "Invalid login credentials": "Correo o contraseña incorrectos.",
  "Email not confirmed": "Debes confirmar tu correo antes de iniciar sesión.",
  "User already registered": "Ya existe una cuenta con este correo.",
}

function translate(message: string) {
  if (message.toLowerCase().includes("rate limit")) return "Demasiados intentos. Espera unos minutos."
  if (message.toLowerCase().includes("password")) return "La contraseña debe tener al menos 6 caracteres."
  return ERRORS[message] ?? "No se pudo completar la operación. Inténtalo de nuevo."
}

export function AuthForm({ mode, initialError }: { mode: "login" | "register"; initialError?: string }) {
  const router = useRouter()
  const [error, setError] = useState(initialError ?? "")
  const [loading, setLoading] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState("")
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
        setError(translate(error.message))
        setLoading(false)
        return
      }
    } else {
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
        setError(translate(error.message))
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
      <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
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
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight">{isLogin ? "Inicia sesión" : "Crea tu cuenta"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {isLogin ? "Ingresa con tu correo y contraseña." : "Regístrate para empezar a hacer preguntas."}
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {!isLogin && (
          <div className="space-y-2">
            <Label htmlFor="fullName">Nombre</Label>
            <Input id="fullName" name="fullName" autoComplete="name" placeholder="Tu nombre" maxLength={100} className="h-10" />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" placeholder="tu@correo.com" className="h-10" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={isLogin ? 6 : 8}
            autoComplete={isLogin ? "current-password" : "new-password"}
            placeholder={isLogin ? "••••••••" : "Mínimo 8 caracteres"}
            className="h-10"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive animate-in fade-in-0">
            {error}
          </p>
        )}

        <Button type="submit" className="h-10 w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          {isLogin ? "Iniciar sesión" : "Crear cuenta"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {isLogin ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
        <Link href={isLogin ? "/register" : "/login"} className="font-medium text-foreground underline-offset-4 hover:underline">
          {isLogin ? "Regístrate" : "Inicia sesión"}
        </Link>
      </p>
    </div>
  )
}
