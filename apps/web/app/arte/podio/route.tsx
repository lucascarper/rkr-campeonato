import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { parseCategory } from "@/lib/categories";
import { formatPoints, initials } from "@/lib/format";

/**
 * Arte de resumo do pódio para redes sociais (PNG).
 * GET /arte/podio?categoria=rk1&etapa=8[&bateria=Bateria A][&formato=feed|story][&download=1]
 * Feed: 1080×1350 (4:5). Story: 1080×1920 (9:16).
 */

const API = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";
const RED = "#E10613";
const BG = "#0A0A0B";
const SURFACE = "#121215";
const MUTED = "#9A9AA3";
// Site oficial do campeonato, no rodapé das artes (pode ser trocado sem mexer no código).
const OFFICIAL_SITE = process.env.NEXT_PUBLIC_OFFICIAL_SITE || "rkrbrasilia.com.br";

type PodiumRow = {
  position: number;
  points: number;
  pole: boolean;
  fastest_lap: boolean;
  driver: { name: string; hidden: boolean; photo_art: string | null };
};
type Podium = {
  season: number;
  category: { code: string };
  event: { number: number; date: string | null; location: string; preseason: boolean };
  race: { label: string; preseason: boolean };
  rows: PodiumRow[];
};

// --- recursos estáticos (lidos uma vez por processo) ---------------------------------------------

let assets: Promise<{ fonts: Font[]; logo: string }> | null = null;
type Font = { name: string; data: Buffer; weight: 500 | 600 | 700 | 800; style: "normal" | "italic" };

function loadAssets() {
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

async function photoData(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const response = await fetch(`${API}${url}`, { next: { revalidate: 3600 } });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "image/jpeg";
    return `data:${type};base64,${Buffer.from(await response.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
function longDate(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

/** Foto 900×1200 cobrindo o cartão (o gerador não aceita backgroundSize: cover), com degradê embaixo. */
const PHOTO_W = 900;
const PHOTO_H = 1200;
const SHADE = "linear-gradient(180deg, rgba(10,10,11,0) 40%, rgba(10,10,11,0.94) 100%)";
function cover(photo: string | null, width: number, height: number) {
  if (!photo) return { backgroundImage: `linear-gradient(160deg, #1C1C21, #0E0E10)` };
  const scale = Math.max(width / PHOTO_W, height / PHOTO_H);
  const w = Math.ceil(PHOTO_W * scale);
  const h = Math.ceil(PHOTO_H * scale);
  const x = Math.round((width - w) / 2);
  return {
    backgroundImage: `${SHADE}, url(${photo})`,
    backgroundSize: `${width}px ${height}px, ${w}px ${h}px`,
    backgroundPosition: `0px 0px, ${x}px 0px`,
    backgroundRepeat: "no-repeat",
  };
}

// --- rota ----------------------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const category = parseCategory(params.get("categoria") ?? "rk1") ?? "RK1";
  const story = params.get("formato") === "story";
  const query = new URLSearchParams({ category });
  if (params.get("etapa")) query.set("event", params.get("etapa")!);
  if (params.get("bateria")) query.set("race", params.get("bateria")!);

  // Sempre atual: a arte é gerada poucas vezes e deve refletir fotos e resultados recém-enviados.
  const response = await fetch(`${API}/api/podium/?${query}`, { cache: "no-store" });
  if (!response.ok) {
    return new Response("Pódio não encontrado para esta categoria/etapa.", { status: 404 });
  }
  const data = (await response.json()) as Podium;
  const { fonts, logo } = await loadAssets();
  const photos = await Promise.all(data.rows.slice(0, 3).map((row) => photoData(row.driver.photo_art)));

  const width = 1080;
  const height = story ? 1920 : 1350;
  const top3 = data.rows.slice(0, 3);
  const rest = data.rows.slice(3, 5);
  // Ordem clássica do pódio: 2º à esquerda, 1º no centro, 3º à direita.
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean) as PodiumRow[];
  const photoHeight = (pos: number) => (story ? [0, 620, 520, 480] : [0, 470, 390, 350])[pos];
  const stepHeight = (pos: number) => (story ? [0, 200, 150, 120] : [0, 150, 110, 80])[pos];
  const title = `ETAPA ${data.event.number}`;
  // Baterias da pré-temporada misturam as categorias: o selo mostra a bateria, não a categoria.
  const badge = data.race.preseason ? data.race.label.toUpperCase() : data.category.code;

  const image = new ImageResponse(
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: BG,
        color: "#FFFFFF",
        fontFamily: "Text",
        overflow: "hidden",
      }}
    >
      {/* Brilhos vermelhos nos cantos (círculos com degradê; o gerador não lida bem com elipses) */}
      <div
        style={{
          position: "absolute",
          left: -520,
          bottom: -520,
          width: 1200,
          height: 1200,
          display: "flex",
          backgroundImage: "radial-gradient(circle, rgba(225,6,19,0.30), rgba(225,6,19,0) 65%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -480,
          top: -520,
          width: 1000,
          height: 1000,
          display: "flex",
          backgroundImage: "radial-gradient(circle, rgba(225,6,19,0.18), rgba(225,6,19,0) 65%)",
        }}
      />
      {/* Linhas de velocidade na diagonal do "R", só na metade de cima e nas bordas do pódio */}
      {/* [topo, largura, opacidade, espessura, esquerda] — só em áreas sem texto */}
      {(story
        ? [
            [520, 620, 0.5, 3, 470],
            [600, 420, 0.3, 2, -120],
            [700, 300, 0.4, 3, 780],
            [780, 260, 0.25, 2, -60],
            [470, 300, 0.22, 2, 760],
          ]
        : [
            [360, 430, 0.5, 3, 670],
            [300, 240, 0.25, 2, 820],
            [505, 300, 0.32, 2, -40],
            [575, 330, 0.42, 3, 740],
          ]
      ).map(([top, w, opacity, h, left], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top,
            left,
            width: w,
            height: h,
            opacity,
            display: "flex",
            transform: "rotate(-14deg)",
            backgroundImage: `linear-gradient(90deg, rgba(225,6,19,0), ${RED} 75%, #FF3B46 96%, #FFFFFF)`,
          }}
        />
      ))}

      {/* Cabeçalho: logo + categoria */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "64px 72px 0",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={logo} width={330} height={81} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div
            style={{
              display: "flex",
              background: RED,
              padding: "6px 22px",
              fontFamily: "Display",
              fontWeight: 800,
              fontStyle: "italic",
              fontSize: 52,
              lineHeight: 1,
            }}
          >
            {badge}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 10,
              fontFamily: "Mono",
              fontSize: 20,
              letterSpacing: 3,
              color: MUTED,
            }}
          >
            {`TEMPORADA ${data.season}`}
          </div>
        </div>
      </div>

      {/* Título */}
      <div
        style={{ display: "flex", flexDirection: "column", padding: story ? "90px 72px 0" : "44px 72px 0" }}
      >
        <div style={{ display: "flex", fontFamily: "Mono", fontSize: 22, letterSpacing: 4, color: MUTED }}>
          {[longDate(data.event.date), data.event.location.toUpperCase()].filter(Boolean).join("  ·  ")}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            marginTop: 8,
            fontFamily: "Display",
            fontWeight: 800,
            fontStyle: "italic",
            lineHeight: 0.9,
          }}
        >
          <span style={{ fontSize: story ? 190 : 160 }}>PÓDIO</span>
          <span style={{ fontSize: story ? 78 : 64, color: RED, marginLeft: 26 }}>{title}</span>
        </div>
        {data.race.preseason && (
          <div
            style={{
              display: "flex",
              marginTop: 14,
              fontFamily: "Mono",
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: 5,
              color: RED,
            }}
          >
            PRÉ-TEMPORADA · CATEGORIAS MISTURADAS
          </div>
        )}
      </div>

      {/* Pódio */}
      <div
        style={{
          display: "flex",
          flexGrow: 1,
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 18,
          padding: "0 56px",
        }}
      >
        {podiumOrder.map((row) => {
          const index = top3.indexOf(row);
          const photo = photos[index];
          const first = row.position === 1;
          const colWidth = first ? 340 : 300;
          return (
            <div key={row.position} style={{ display: "flex", flexDirection: "column", width: colWidth }}>
              {/* Cartão da foto: foto e degradê como camadas de fundo, nome alinhado embaixo pelo layout.
                    (Elementos absolutos + overflow no cartão faziam o gerador desenhar um bloco na origem.) */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  width: colWidth,
                  height: photoHeight(row.position),
                  padding: "0 14px 14px 18px",
                  backgroundColor: SURFACE,
                  border: first ? `3px solid ${RED}` : "2px solid rgba(255,255,255,0.18)",
                  // Sem "boxShadow: none": o gerador desenhava esse valor como um bloco preto na origem.
                  ...(first ? { boxShadow: "0 0 60px rgba(225,6,19,0.55)" } : {}),
                  ...cover(photo, colWidth, photoHeight(row.position)),
                }}
              >
                {!photo && (
                  <div
                    style={{
                      display: "flex",
                      flexGrow: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "Display",
                      fontWeight: 800,
                      fontStyle: "italic",
                      fontSize: 150,
                      color: "rgba(255,255,255,0.14)",
                    }}
                  >
                    {initials(row.driver.name)}
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    fontFamily: "Display",
                    fontWeight: 800,
                    fontStyle: "italic",
                    fontSize: first ? 46 : 40,
                    lineHeight: 0.95,
                    textTransform: "uppercase",
                  }}
                >
                  {row.driver.name}
                </div>
              </div>
              {/* Degrau */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  height: stepHeight(row.position),
                  padding: "0 20px",
                  background: first ? RED : SURFACE,
                  ...(first ? {} : { borderTop: "2px solid rgba(255,255,255,0.1)" }),
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    fontFamily: "Display",
                    fontWeight: 800,
                    fontStyle: "italic",
                    fontSize: first ? 110 : 84,
                    lineHeight: 1,
                  }}
                >
                  <span>{row.position}</span>
                  <span style={{ fontSize: first ? 44 : 34, marginTop: 10, marginLeft: 6 }}>º</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span style={{ fontFamily: "Mono", fontWeight: 700, fontSize: first ? 40 : 32 }}>
                    {formatPoints(row.points)}
                  </span>
                  <span
                    style={{
                      fontFamily: "Mono",
                      fontSize: 16,
                      letterSpacing: 3,
                      color: first ? "#FFD7DA" : MUTED,
                    }}
                  >
                    PTS
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4º e 5º: só o nome */}
      <div
        style={{ display: "flex", flexDirection: "column", padding: story ? "56px 72px 0" : "36px 72px 0" }}
      >
        {rest.map((row) => (
          <div
            key={row.position}
            style={{
              display: "flex",
              alignItems: "center",
              height: story ? 96 : 76,
              borderTop: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            <div
              style={{
                display: "flex",
                width: 96,
                fontFamily: "Display",
                fontWeight: 800,
                fontStyle: "italic",
                fontSize: 50,
                color: RED,
              }}
            >
              {`${row.position}º`}
            </div>
            <div style={{ display: "flex", flexGrow: 1, fontWeight: 600, fontSize: story ? 42 : 38 }}>
              {row.driver.name}
            </div>
            <div style={{ display: "flex", fontFamily: "Mono", fontWeight: 500, fontSize: 28, color: MUTED }}>
              {`${formatPoints(row.points)} pts`}
            </div>
          </div>
        ))}
      </div>

      {/* Rodapé */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: story ? "40px 72px 80px" : "24px 72px 48px",
          fontFamily: "Mono",
          fontSize: 20,
          letterSpacing: 3,
          color: MUTED,
        }}
      >
        <span>CLASSIFICAÇÃO COMPLETA</span>
        <span style={{ color: "#FFFFFF" }}>{OFFICIAL_SITE.toUpperCase()}</span>
      </div>
      <div style={{ display: "flex", height: 10, background: RED }} />
    </div>,
    { width, height, fonts },
  );

  const headers = new Headers(image.headers);
  headers.set("Cache-Control", "public, max-age=60");
  if (params.get("download")) {
    const race = data.race.preseason ? `-${data.race.label.toLowerCase().replace(/\s+/g, "-")}` : "";
    const name = `rkr-podio-${category.toLowerCase()}-etapa-${data.event.number}${race}-${story ? "story" : "feed"}.png`;
    headers.set("Content-Disposition", `attachment; filename="${name}"`);
  }
  return new Response(image.body, { status: image.status, headers });
}
