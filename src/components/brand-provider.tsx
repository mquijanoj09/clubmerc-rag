"use client"

import { createContext, useContext } from "react"

type Brand = { logoUrl: string | null; iconUrl: string | null; iconDarkUrl: string | null }

const BrandContext = createContext<Brand>({ logoUrl: null, iconUrl: null, iconDarkUrl: null })

/** Datos de marca que necesitan los componentes cliente (logo e ícono configurados en el panel). */
export function BrandProvider({ logoUrl, iconUrl, iconDarkUrl, children }: Brand & { children: React.ReactNode }) {
  return <BrandContext value={{ logoUrl, iconUrl, iconDarkUrl }}>{children}</BrandContext>
}

export const useBrand = () => useContext(BrandContext)
