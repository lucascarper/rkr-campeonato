"use client";

import { useCallback, useMemo, useState } from "react";

import { fetchJSON, prefetchDriver } from "@/lib/client";
import { formatDate } from "@/lib/format";
import type { Standings } from "@/lib/types";
import { useDriverParam } from "@/lib/useDriverParam";

import { DriverModal } from "./DriverModal";
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
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:pt-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Temporada {data.season} · Classificação geral · sem descarte</p>
          <h1 className="display mt-2 text-5xl font-extrabold sm:text-7xl">
            <span className="text-red">{category}</span> <span className="text-text">Classificação</span>
          </h1>
          {currentEvent && (
            <p className="num mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="inline-flex items-center gap-2 text-text">
                <span className="h-1.5 w-1.5 bg-red shadow-[0_0_8px_var(--red-glow)]" />
                Após a etapa {currentEvent.number}
              </span>
              <span>{currentEvent.location}</span>
              <span>{formatDate(currentEvent.date)}</span>
              {nextEvent && data.upto === latest && (
                <span className="text-faint">
                  Próxima: E{nextEvent.number} · {nextEvent.location} · {formatDate(nextEvent.date)}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Classificação até a etapa</span>
            <span className="cut-sm relative flex items-center border border-line-strong bg-surface">
              <select
                value={data.upto ?? ""}
                onChange={(e) => changeUpto(Number(e.target.value))}
                disabled={!data.cuts.length}
                className="num w-full appearance-none bg-transparent py-2.5 pl-3 pr-9 text-sm outline-none sm:w-56"
              >
                {data.events.length === 0 && <option value="">—</option>}
                {[...data.cuts].reverse().map((n) => {
                  const ev = data.calendar.find((e) => e.number === n);
                  return (
                    <option key={n} value={n} className="bg-surface">
                      Etapa {n}
                      {ev ? ` · ${ev.location}` : ""}
                    </option>
                  );
                })}
              </select>
              <svg
                viewBox="0 0 10 10"
                className="pointer-events-none absolute right-3 h-2.5 w-2.5 text-red"
                aria-hidden
              >
                <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Buscar piloto</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome do piloto"
              className="cut-sm border border-line-strong bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-faint focus:border-red sm:w-56"
            />
          </label>
        </div>
      </div>

      <div
        className={loading ? "mt-6 opacity-60 transition-opacity" : "mt-6 transition-opacity"}
        aria-busy={loading}
      >
        {data.rows.length ? (
          <TimingTower
            rows={data.rows}
            events={data.events}
            search={search}
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
        onClose={closeDriver}
        onNavigate={navigateDriver}
      />
    </div>
  );
}
