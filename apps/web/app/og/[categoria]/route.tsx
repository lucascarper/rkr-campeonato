import { readFile } from "node:fs/promises";
import path from "node:path";

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { parseCategory } from "@/lib/categories";
import type { DriverProfile, Standings } from "@/lib/types";

const API = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";

async function get<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API}${path}`, { next: { tags: ["rkr"], revalidate: 600 } });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Imagem de pré-visualização (Open Graph) por categoria e por piloto, para o link no WhatsApp. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ categoria: string }> }) {
  const category = parseCategory((await params).categoria) ?? "RK1";
  const slug = request.nextUrl.searchParams.get("piloto");
  const profile = slug
    ? await get<DriverProfile>(`/api/drivers/${encodeURIComponent(slug)}/?category=${category}`)
    : null;
  const standings = profile ? null : await get<Standings>(`/api/standings/?category=${category}`);
  const logoFile = await readFile(path.join(process.cwd(), "public/brand/logo.png"));
  const logo = `data:image/png;base64,${logoFile.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: "#0A0A0B",
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
        color: "white",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={logo} width={260} height={64} />
        <div style={{ fontSize: 30, color: "#9A9AA3", marginLeft: "auto" }}>{category}</div>
      </div>

      {profile ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 30, color: "#E10613" }}>
            {`${profile.rank ? `${profile.rank}º em ${category}` : category} · ${profile.season}`}
          </div>
          <div
            style={{
              fontSize: 96,
              fontWeight: 800,
              fontStyle: "italic",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            {profile.driver.name}
          </div>
          <div style={{ display: "flex", gap: 48, marginTop: 28, fontSize: 30, color: "#9A9AA3" }}>
            <span>{`${profile.stats.points} pts`}</span>
            <span>{`${profile.stats.wins} vitórias`}</span>
            <span>{`${profile.stats.podiums} pódios`}</span>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 88, fontWeight: 800, fontStyle: "italic", lineHeight: 1 }}>
            {`CLASSIFICAÇÃO ${category}`}
          </div>
          {(standings?.rows ?? []).slice(0, 3).map((row) => (
            <div key={row.driver.id} style={{ display: "flex", fontSize: 32, gap: 24 }}>
              <span style={{ color: row.position === 1 ? "#E10613" : "#9A9AA3", width: 48 }}>
                {row.position}
              </span>
              <span style={{ flex: 1 }}>{row.driver.name}</span>
              <span>{`${row.points} pts`}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", fontSize: 22, color: "#9A9AA3" }}>
        {standings?.upto ? `Após a etapa ${standings.upto}` : "Temporada em andamento"}
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
