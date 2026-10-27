import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las páginas dependen de la sesión del usuario: se renderizan en cada solicitud.
  cacheComponents: false,
  // pdf.js (unpdf) y mammoth se ejecutan en Node.js sin empaquetar.
  serverExternalPackages: ["unpdf", "mammoth"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
