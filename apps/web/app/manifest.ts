import type { MetadataRoute } from "next";

/** Permite instalar o site na tela inicial do celular (abre em tela cheia, com o ícone do R). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RKR Kart Racing",
    short_name: "RKR",
    description: "Classificação, estatísticas e calendário do campeonato de Kart Rental RKR.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A0A0B",
    theme_color: "#0A0A0B",
    lang: "pt-BR",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
