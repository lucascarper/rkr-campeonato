import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

/** Base comum das artes para redes sociais (/arte/...): cores, fontes, logo e dados. */

export const API = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";
export const RED = "#E10613";
export const BG = "#0A0A0B";
export const SURFACE = "#121215";
export const MUTED = "#9A9AA3";
// Site oficial do campeonato, no rodapé das artes (pode ser trocado sem mexer no código).
export const OFFICIAL_SITE = process.env.NEXT_PUBLIC_OFFICIAL_SITE || "rkrbrasilia.com.br";

type Font = { name: string; data: Buffer; weight: 500 | 600 | 700 | 800; style: "normal" | "italic" };
let assets: Promise<{ fonts: Font[]; logo: string }> | null = null;

/** Fontes da identidade (woff do @fontsource; o gerador não lê woff2) e logo, lidas uma vez por processo. */
export function loadArtAssets() {
  assets ??= (async () => {
    const font = (pkg: string, file: string) =>
      readFile(path.join(process.cwd(), "node_modules/@fontsource", pkg, "files", file));
    const [condensed800, condensed700, semi500, semi600, mono500, mono700, logo] = await Promise.all([
      font("barlow-condensed", "barlow-condensed-latin-800-italic.woff"),
      font("barlow-condensed", "barlow-condensed-latin-700-italic.woff"),
      font("barlow-semi-condensed", "barlow-semi-condensed-latin-500-normal.woff"),
      font("barlow-semi-condensed", "barlow-semi-condensed-latin-600-normal.woff"),
      font("jetbrains-mono", "jetbrains-mono-latin-500-normal.woff"),
      font("jetbrains-mono", "jetbrains-mono-latin-700-normal.woff"),
      readFile(path.join(process.cwd(), "public/brand/logo.png")),
    ]);
    return {
      logo: `data:image/png;base64,${logo.toString("base64")}`,
      fonts: [
        { name: "Display", data: condensed800, weight: 800, style: "italic" },
        { name: "Display", data: condensed700, weight: 700, style: "italic" },
        { name: "Text", data: semi500, weight: 500, style: "normal" },
        { name: "Text", data: semi600, weight: 600, style: "normal" },
        { name: "Mono", data: mono500, weight: 500, style: "normal" },
        { name: "Mono", data: mono700, weight: 700, style: "normal" },
      ] satisfies Font[],
    };
  })();
  return assets;
}

/** Busca uma imagem da api (fotos, traçados) como data URI; null se não houver. */
export async function fetchImage(
  url: string | null,
): Promise<{ data: string; width: number; height: number } | null> {
  if (!url) return null;
  try {
    const response = await fetch(`${API}${url}`, { next: { revalidate: 3600 } });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const type = response.headers.get("content-type") ?? "image/jpeg";
    return { data: `data:${type};base64,${buffer.toString("base64")}`, ...imageSize(buffer, type) };
  } catch {
    return null;
  }
}

function imageSize(buffer: Buffer, type: string): { width: number; height: number } {
  if (type === "image/png" && buffer.length > 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (type === "image/jpeg") {
    let offset = 2;
    while (offset < buffer.length) {
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return { width: 0, height: 0 };
}

const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const WEEKDAYS = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];

/** "2026-10-03" -> "03 OUT 2026" */
export function longDate(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-10-03" -> "SÁBADO" */
export function weekday(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Cabeçalhos da resposta PNG, com download opcional. */
export function artHeaders(base: Headers, download: string | null) {
  const headers = new Headers(base);
  headers.set("Cache-Control", "public, max-age=60");
  if (download) headers.set("Content-Disposition", `attachment; filename="${download}"`);
  return headers;
}
