import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Barlow_Semi_Condensed, JetBrains_Mono } from "next/font/google";

import { SiteHeader } from "@/components/SiteHeader";
import { SpeedLines } from "@/components/SpeedLines";
import { siteUrl } from "@/lib/site";

import "./globals.css";

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-barlow-condensed",
  display: "swap",
});
const sans = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-barlow-semi",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "RKR Kart Racing — Campeonato", template: "%s · RKR Kart Racing" },
  description: "Classificação, estatísticas e trajetória dos pilotos do campeonato de Kart Rental RKR.",
  openGraph: { siteName: "RKR Kart Racing", locale: "pt_BR", type: "website" },
};

export const viewport: Viewport = { themeColor: "#0A0A0B", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="antialiased">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-red focus:px-3 focus:py-2"
        >
          Pular para o conteúdo
        </a>
        <SpeedLines />
        <SiteHeader />
        <main id="conteudo">{children}</main>
      </body>
    </html>
  );
}
