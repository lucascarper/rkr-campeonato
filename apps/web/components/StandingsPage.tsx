import type { Metadata } from "next";
import { Suspense } from "react";

import { getStandings } from "@/lib/api";
import type { CategoryCode } from "@/lib/types";

import { ApiUnavailable } from "./ApiUnavailable";
import { StandingsView } from "./StandingsView";

export async function StandingsPage({ category, etapa }: { category: CategoryCode; etapa?: string }) {
  const upto = etapa ? Number(etapa) || null : null;
  const standings = await getStandings(category, upto);
  if (!standings) return <ApiUnavailable />;
  return (
    <Suspense>
      <StandingsView key={`${category}-${standings.upto}`} initial={standings} />
    </Suspense>
  );
}

export function standingsMetadata(category: CategoryCode, piloto?: string): Metadata {
  const title = `Classificação ${category}`;
  const image = piloto
    ? `/og/${category.toLowerCase()}?piloto=${encodeURIComponent(piloto)}`
    : `/og/${category.toLowerCase()}`;
  return {
    title,
    description: `Classificação geral do campeonato RKR na categoria ${category}, etapa a etapa.`,
    openGraph: { title: `${title} · RKR Kart Racing`, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}
