import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ApiUnavailable } from "@/components/ApiUnavailable";
import { DashboardView } from "@/components/DashboardView";
import { getDashboard } from "@/lib/api";
import { parseCategory } from "@/lib/categories";

type Props = {
  params: Promise<{ categoria: string }>;
  searchParams: Promise<{ de?: string; ate?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = parseCategory((await params).categoria);
  if (!category) return {};
  const image = `/og/${category.toLowerCase()}`;
  return {
    title: `Dashboard ${category}`,
    description: `Voltas rápidas, vitórias, consistência e penalizações da categoria ${category}.`,
    openGraph: { images: [{ url: image, width: 1200, height: 630 }] },
  };
}

export default async function DashboardPage({ params, searchParams }: Props) {
  const category = parseCategory((await params).categoria);
  if (!category) notFound();
  const { de, ate } = await searchParams;
  const dashboard = await getDashboard(category, Number(de) || null, Number(ate) || null);
  if (!dashboard) return <ApiUnavailable />;
  return (
    <Suspense>
      <DashboardView initial={dashboard} />
    </Suspense>
  );
}
