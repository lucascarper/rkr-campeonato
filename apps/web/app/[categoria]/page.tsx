import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StandingsPage, standingsMetadata } from "@/components/StandingsPage";
import { parseCategory } from "@/lib/categories";

type Props = {
  params: Promise<{ categoria: string }>;
  searchParams: Promise<{ etapa?: string; piloto?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const category = parseCategory((await params).categoria);
  return category ? standingsMetadata(category, (await searchParams).piloto) : {};
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const category = parseCategory((await params).categoria);
  if (!category) notFound();
  const { etapa } = await searchParams;
  return <StandingsPage category={category} etapa={etapa} />;
}
