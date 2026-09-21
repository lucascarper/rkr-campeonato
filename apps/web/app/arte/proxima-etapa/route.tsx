import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import {
  API,
  BG,
  MUTED,
  OFFICIAL_SITE,
  RED,
  SURFACE,
  artHeaders,
  fetchImage,
  loadArtAssets,
  longDate,
  weekday,
} from "@/lib/art";

/**
 * Arte de aviso da próxima etapa (PNG): número, local, data, horários, traçado e sentido.
 * GET /arte/proxima-etapa?etapa=9[&formato=feed|story][&download=1]
 * Os dados vêm do que foi preenchido no painel (Artes → Próxima etapa).
 */

type Card = {
  season: number;
  event: { number: number; date: string | null; location: string };
  schedule: Partial<Record<"practice" | "RK3" | "RK2" | "RK1", string>>;
  track_direction: "" | "cw" | "ccw";
  track_art: string | null;
};

const SLOTS = [
  { key: "practice", label: "TREINO" },
  { key: "RK3", label: "RK3" },
  { key: "RK2", label: "RK2" },
  { key: "RK1", label: "RK1" },
] as const;

/** Seta circular do sentido da pista (horário ou anti-horário), desenhada em SVG. */
function DirectionArrow({ direction, size }: { direction: "cw" | "ccw"; size: number }) {
  const cw = direction === "cw";
  const arc = cw ? "M24 6 A18 18 0 1 1 8.41 15" : "M24 6 A18 18 0 1 0 39.59 15";
  const head = cw ? "11.9,7.2 3.4,12.1 12.9,19.1" : "36.1,7.2 44.6,12.1 35.1,19.1";
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <path d={arc} fill="none" stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round" />
      <polygon points={head} fill="#FFFFFF" />
    </svg>
  );
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const story = params.get("formato") === "story";
  const query = new URLSearchParams();
  if (params.get("etapa")) query.set("event", params.get("etapa")!);

  // Sempre atual: reflete na hora o que foi salvo no painel.
  const response = await fetch(`${API}/api/event-card/?${query}`, { cache: "no-store" });
  if (!response.ok) return new Response("Etapa não encontrada.", { status: 404 });
  const card = (await response.json()) as Card;
  const [{ fonts, logo }, track] = await Promise.all([loadArtAssets(), fetchImage(card.track_art)]);

  const width = 1080;
  const height = story ? 1920 : 1350;
  const pad = 72;
  // Área do traçado: o desenho é redimensionado para caber inteiro (proporção preservada).
  const trackBox = { width: width - 2 * pad, height: story ? 760 : 470 };
  const scale = track?.width ? Math.min(trackBox.width / track.width, trackBox.height / track.height) : 0;
  const trackSize = track?.width
    ? { width: Math.round(track.width * scale), height: Math.round(track.height * scale) }
    : null;
  const direction = card.track_direction || null;

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
      {/* Brilhos e linhas de velocidade, como no site */}
      <div
        style={{
          position: "absolute",
          right: -520,
          bottom: -520,
          width: 1200,
          height: 1200,
          display: "flex",
          backgroundImage: "radial-gradient(circle, rgba(225,6,19,0.28), rgba(225,6,19,0) 65%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -480,
          top: -520,
          width: 1000,
          height: 1000,
          display: "flex",
          backgroundImage: "radial-gradient(circle, rgba(225,6,19,0.16), rgba(225,6,19,0) 65%)",
        }}
      />
      {(story
        ? [
            [590, 520, 0.45, 3, 560],
            [650, 300, 0.25, 2, -120],
          ]
        : [
            [430, 420, 0.45, 3, 680],
            [470, 260, 0.25, 2, -90],
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

      {/* Cabeçalho */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `64px ${pad}px 0`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={logo} width={330} height={81} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div
            style={{
              display: "flex",
              background: RED,
              padding: "8px 20px",
              fontFamily: "Display",
              fontWeight: 800,
              fontStyle: "italic",
              fontSize: 40,
              lineHeight: 1,
            }}
          >
            PRÓXIMA ETAPA
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
            {`TEMPORADA ${card.season}`}
          </div>
        </div>
      </div>

      {/* Etapa, local e data */}
      <div style={{ display: "flex", flexDirection: "column", padding: `${story ? 90 : 40}px ${pad}px 0` }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontFamily: "Display",
            fontWeight: 800,
            fontStyle: "italic",
            lineHeight: 0.9,
          }}
        >
          <span style={{ fontSize: story ? 200 : 170 }}>ETAPA</span>
          <span style={{ fontSize: story ? 200 : 170, color: RED, marginLeft: 28 }}>{card.event.number}</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 10,
            fontFamily: "Display",
            fontWeight: 700,
            fontStyle: "italic",
            fontSize: story ? 72 : 60,
            lineHeight: 1,
            textTransform: "uppercase",
          }}
        >
          {card.event.location || "Local a definir"}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 18,
            fontFamily: "Mono",
            fontWeight: 700,
            fontSize: story ? 32 : 28,
            letterSpacing: 5,
            color: MUTED,
          }}
        >
          {card.event.date ? `${weekday(card.event.date)} · ${longDate(card.event.date)}` : "DATA A DEFINIR"}
        </div>
      </div>

      {/* Traçado + sentido */}
      <div
        style={{
          display: "flex",
          flexGrow: 1,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: `0 ${pad}px`,
        }}
      >
        {track && trackSize ? (
          <div
            style={{
              display: "flex",
              width: trackSize.width,
              height: trackSize.height,
              backgroundImage: `url(${track.data})`,
              backgroundSize: `${trackSize.width}px ${trackSize.height}px`,
              backgroundRepeat: "no-repeat",
            }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              fontFamily: "Mono",
              fontSize: 24,
              letterSpacing: 5,
              color: "rgba(255,255,255,0.3)",
            }}
          >
            TRAÇADO A DEFINIR
          </div>
        )}
        {direction && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginTop: story ? 36 : 18,
              padding: "10px 22px 10px 14px",
              border: "2px solid rgba(255,255,255,0.18)",
              background: "rgba(18,18,21,0.85)",
            }}
          >
            <DirectionArrow direction={direction} size={story ? 52 : 44} />
            <span
              style={{
                display: "flex",
                marginLeft: 14,
                fontFamily: "Mono",
                fontWeight: 700,
                fontSize: story ? 28 : 24,
                letterSpacing: 4,
              }}
            >
              {direction === "cw" ? "SENTIDO HORÁRIO" : "SENTIDO ANTI-HORÁRIO"}
            </span>
          </div>
        )}
      </div>

      {/* Horários */}
      <div
        style={{
          display: "flex",
          flexDirection: story ? "column" : "row",
          margin: `${story ? 56 : 30}px ${pad}px 0`,
          gap: story ? 0 : 12,
        }}
      >
        {SLOTS.map((slot, i) => {
          const time = card.schedule?.[slot.key];
          const practice = slot.key === "practice";
          return story ? (
            <div
              key={slot.key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: 104,
                padding: "0 28px",
                background: i % 2 ? "rgba(18,18,21,0.6)" : SURFACE,
                borderLeft: `6px solid ${practice ? "rgba(255,255,255,0.35)" : RED}`,
              }}
            >
              <span
                style={{ fontFamily: "Mono", fontWeight: 700, fontSize: 34, letterSpacing: 5, color: MUTED }}
              >
                {slot.label}
              </span>
              <span style={{ fontFamily: "Display", fontWeight: 800, fontStyle: "italic", fontSize: 72 }}>
                {time || "—"}
              </span>
            </div>
          ) : (
            <div
              key={slot.key}
              style={{
                display: "flex",
                flexDirection: "column",
                flexGrow: 1,
                flexBasis: 0,
                padding: "18px 20px 16px",
                background: SURFACE,
                borderTop: `5px solid ${practice ? "rgba(255,255,255,0.35)" : RED}`,
              }}
            >
              <span
                style={{ fontFamily: "Mono", fontWeight: 700, fontSize: 24, letterSpacing: 4, color: MUTED }}
              >
                {slot.label}
              </span>
              <span
                style={{
                  fontFamily: "Display",
                  fontWeight: 800,
                  fontStyle: "italic",
                  fontSize: 64,
                  lineHeight: 1.05,
                }}
              >
                {time || "—"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Rodapé */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: story ? `40px ${pad}px 80px` : `26px ${pad}px 44px`,
          fontFamily: "Mono",
          fontSize: 20,
          letterSpacing: 3,
          color: MUTED,
        }}
      >
        <span>CLASSIFICAÇÃO E RESULTADOS</span>
        <span style={{ color: "#FFFFFF" }}>{OFFICIAL_SITE.toUpperCase()}</span>
      </div>
      <div style={{ display: "flex", height: 10, background: RED }} />
    </div>,
    { width, height, fonts },
  );

  const filename = `rkr-proxima-etapa-${card.event.number}-${story ? "story" : "feed"}.png`;
  return new Response(image.body, {
    status: image.status,
    headers: artHeaders(image.headers, params.get("download") ? filename : null),
  });
}
