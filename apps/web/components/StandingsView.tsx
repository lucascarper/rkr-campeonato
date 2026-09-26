"use client";

import { useCallback, useMemo, useState } from "react";

import { fetchJSON, prefetchDriver } from "@/lib/client";
import { formatDate } from "@/lib/format";
import type { Standings } from "@/lib/types";
import { useDriverParam } from "@/lib/useDriverParam";

import { DriverModal } from "./DriverModal";
import { PodiumStrip } from "./PodiumStrip";
import { StageBar } from "./StageBar";
import { TimingTower } from "./TimingTower";

export function StandingsView({ initial }: { initial: Standings }) {
  const [data, setData] = useState(initial);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const {
    openSlug,
    open: openDriver,
    navigate: navigateDriver,
    close: closeDriver,
    write: setUrl,
  } = useDriverParam();

  const category = data.category.code;
  const latest = data.cuts[data.cuts.length - 1] ?? null;
  const currentEvent = data.events.find((e) => e.number === data.upto);
  const nextEvent = data.calendar.find((e) => e.status === "scheduled");

  const changeUpto = async (value: number) => {
    setLoading(true);
    try {
      const next = await fetchJSON<Standings>(`/api/standings?category=${category}&upto=${value}`);
      setData(next);
      setUrl(
        (url) =>
          value === latest ? url.searchParams.delete("etapa") : url.searchParams.set("etapa", String(value)),
        "replace",
      );
    } finally {
      setLoading(false);
    }
  };

  const hoverDriver = useCallback(
    (slug: string) => prefetchDriver(slug, category, data.upto),
    [category, data.upto],
  );

  const order = useMemo(() => data.rows.filter((r) => !r.driver.hidden).map((r) => r.driver), [data.rows]);
  const index = order.findIndex((d) => d.slug === openSlug);
  const neighbor = (i: number) =>
    i >= 0 && i < order.length ? { slug: order[i].slug, name: order[i].name } : null;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-4 sm:pt-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
        <div>
          <p className="eyebrow">
            Temporada {data.season} · Classificação geral
            <span className="hidden sm:inline"> · sem descarte</span>
          </p>
          <h1 className="display mt-1.5 text-4xl font-extrabold sm:mt-2 sm:text-7xl">
            <span className="text-red">{category}</span> <span className="text-text">Classificação</span>
          </h1>
          {currentEvent && (
            <p className="num mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted sm:mt-3">
              <span className="inline-flex items-center gap-2 text-text">
                <span className="h-1.5 w-1.5 bg-red shadow-[0_0_8px_var(--red-glow)]" />
                Após a etapa {currentEvent.number}
              </span>
              <span>{currentEvent.location}</span>
              <span>{formatDate(currentEvent.date)}</span>
              {nextEvent && data.upto === latest && (
                <span className="hidden text-faint sm:inline">
                  Próxima: E{nextEvent.number} · {nextEvent.location} · {formatDate(nextEvent.date)}
                </span>
              )}
            </p>
          )}
        </div>

        <label className="hidden flex-col gap-1.5 sm:flex">
          <span className="eyebrow">Buscar piloto</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome do piloto"
            aria-label="Buscar piloto"
            className="cut-sm w-56 border border-line-strong bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-faint focus:border-red"
          />
        </label>
      </div>

      {/* Etapas: um toque mostra a classificação como estava após aquela etapa. */}
      <div className="mt-4 flex flex-col gap-2 sm:mt-6">
        <span className="eyebrow hidden sm:block">Classificação até a etapa</span>
        <StageBar cuts={data.cuts} calendar={data.calendar} selected={data.upto} onSelect={changeUpto} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar piloto"
          aria-label="Buscar piloto"
          className="cut-sm border border-line-strong bg-surface px-2.5 py-2 text-xs outline-none placeholder:text-faint focus:border-red sm:hidden"
        />
      </div>

      {/* Pódio da categoria: a foto dos 3 primeiros, a peça visual da tela. */}
      {data.rows.length >= 3 && !search && (
        <div className="mt-5 sm:mt-8 lg:max-w-4xl">
          <PodiumStrip rows={data.rows} onOpen={openDriver} onHover={hoverDriver} />
        </div>
      )}

      <div
        className={loading ? "mt-4 opacity-60 transition-opacity sm:mt-6" : "mt-4 transition-opacity sm:mt-6"}
        aria-busy={loading}
      >
        {data.rows.length ? (
          <TimingTower
            rows={data.rows}
            events={data.events}
            search={search}
            pulseKey={data.upto ?? 0}
            selectedSlug={openSlug}
            onOpenDriver={openDriver}
            onHoverDriver={hoverDriver}
          />
        ) : (
          <div className="panel cut px-6 py-16 text-center">
            <p className="display text-3xl font-bold">Sem resultados em {category}</p>
            <p className="mt-2 text-muted">
              A classificação aparece aqui assim que a organização importar a primeira etapa.
            </p>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-muted">
        Toque no nome do piloto para ver estatísticas e a evolução com e sem descarte. Pontos por etapa somam
        todas as baterias da etapa; “PRÉ” marca a pré-temporada.
      </p>

      <DriverModal
        slug={openSlug}
        category={category}
        upto={data.upto}
        previous={neighbor(index - 1)}
        next={neighbor(index + 1)}
        drivers={order.map((d) => ({ slug: d.slug, name: d.name }))}
        onClose={closeDriver}
        onNavigate={navigateDriver}
      />
    </div>
  );
}
