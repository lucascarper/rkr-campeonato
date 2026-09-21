import type { Metadata } from "next";

import { StandingsPage, standingsMetadata } from "@/components/StandingsPage";

type Props = { searchParams: Promise<{ etapa?: string; piloto?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return standingsMetadata("RK1", (await searchParams).piloto);
}

export default async function Home({ searchParams }: Props) {
  const { etapa } = await searchParams;
  return <StandingsPage category="RK1" etapa={etapa} />;
}
