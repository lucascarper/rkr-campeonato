"use client";

import clsx from "clsx";
import { useCallback, useMemo, useState } from "react";

import { fetchJSON, prefetchDriver } from "@/lib/client";
import { formatDecimal, formatLap, formatPoints } from "@/lib/format";
import type { Dashboard, RankEntry } from "@/lib/types";
import { useDriverParam } from "@/lib/useDriverParam";

import { CountUp } from "./CountUp";
import { DriverModal } from "./DriverModal";
import { CHART_THEME, EChart } from "./EChart";
import { TopBars } from "./TopBars";

export function DashboardView({ initial }: { initial: Dashboard }) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const { openSlug, open, navigate, close, write } = useDriverParam();
  const category = data.category.code;
  const events = data.all_events.map((e) => e.number);
  const first = events[0];
  const last = events[events.length - 1];

  const changeRange = async (from: number, to: number) => {
    if (from > to) [from, to] = [to, from];
    setLoading(true);
    try {
      setData(await fetchJSON<Dashboard>(`/api/dashboard?category=${category}&from=${from}&to=${to}`));
      write((url) => {
        url.searchParams.set("de", String(from));
        url.searchParams.set("ate", String(to));
        if (from === first && to === last) {
          url.searchParams.delete("de");
          url.searchParams.delete("ate");
        }
      }, "replace");
    } finally {
      setLoading(false);
    }
  };

  const hover = useCallback((slug: string) => prefetchDriver(slug, category), [category]);
  const name = (entry?: RankEntry) => (entry ? (data.drivers[String(entry.driver_id)]?.name ?? "—") : "—");

  // Navegação entre pilotos na janela segue a ordem da classificação (linhas do mapa de resultados).
  const order = useMemo(
    () =>
      data.extras.heatmap.rows.map((r) => data.drivers[String(r.driver_id)]).filter((d) => d && !d.hidden),
    [data],
  );
  const index = order.findIndex((d) => d.slug === openSlug);
  const neighbor = (i: number) =>
    i >= 0 && i < order.length ? { slug: order[i].slug, name: order[i].name } : null;

  const { indicators, extras } = data;
  const bars = { drivers: data.drivers, onOpen: open, onHover: hover };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-20 pt-6 sm:pt-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">
            Temporada {data.season} · {data.total_races} corridas no intervalo
          </p>
          <h1 className="display mt-2 text-5xl font-extrabold sm:text-7xl">
            <span className="text-red">{category}</span> Dashboard
          </h1>
        </div>
        {events.length > 0 && (
          <div className="flex items-end gap-3">
            <RangeSelect
              label="Da etapa"
              value={data.range.from ?? first}
              events={events}
              onChange={(v) => changeRange(v, data.range.to ?? last)}
            />
            <RangeSelect
              label="Até a etapa"
              value={data.range.to ?? last}
              events={events}
              onChange={(v) => changeRange(data.range.from ?? first, v)}
            />
          </div>
        )}
      </div>

      <div className={clsx("mt-8 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
        {/* Indicadores obrigatórios */}
        <section
          aria-label="Indicadores principais"
          className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4"
        >
          <IndicatorCard
            label="Mais voltas rápidas"
            leader={name(indicators.fastest_laps.top[0])}
            value={indicators.fastest_laps.top[0]?.value ?? 0}
            unit="VR"
            tone="fastest"
          >
            <TopBars entries={indicators.fastest_laps.top} tone="fastest" {...bars} />
          </IndicatorCard>
          <IndicatorCard
            label="Mais vitórias"
            leader={name(indicators.wins.top[0])}
            value={indicators.wins.top[0]?.value ?? 0}
            unit="vitórias"
          >
            <TopBars
              entries={indicators.wins.top}
              detail={(e) => (e.seconds ? `${e.seconds}× 2º` : null)}
              {...bars}
            />
          </IndicatorCard>
          <IndicatorCard
            label={`Mais consistente · top ${indicators.consistency.n}`}
            leader={name(indicators.consistency.top[0])}
            value={indicators.consistency.top[0]?.value ?? 0}
            unit="%"
            decimals
            note={`Percentual de corridas entre os ${indicators.consistency.n} primeiros. Mínimo de ${indicators.consistency.min_races} corridas.`}
          >
            <TopBars
              entries={indicators.consistency.top}
              format={(v) => `${formatDecimal(v, 0)}%`}
              detail={(e) => `média ${formatDecimal(e.avg_position as number)}`}
              {...bars}
            />
          </IndicatorCard>
          <IndicatorCard
            label="Penalizações na categoria"
            leader={`${formatDecimal(indicators.penalties.total_seconds, 0)} s acumulados`}
            value={indicators.penalties.total}
            unit="no total"
          >
            <TopBars
              entries={indicators.penalties.top}
              detail={(e) => ((e.seconds as number) ? `${formatDecimal(e.seconds as number, 0)} s` : null)}
              empty="Nenhuma penalização no intervalo."
              {...bars}
            />
          </IndicatorCard>
        </section>

        {/* Estatísticas extras: cartões sem dado na planilha não aparecem */}
        <h2 className="display mt-14 text-3xl font-extrabold">Mais números</h2>
        <div className="mt-4 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          <ExtraCard title="Pódios">
            <TopBars entries={extras.podiums} {...bars} />
          </ExtraCard>
          <ExtraCard title="Posição média de chegada" note="Menor é melhor · mínimo de 50% das corridas">
            <TopBars entries={extras.avg_position} format={(v) => formatDecimal(v)} lowerIsBetter {...bars} />
          </ExtraCard>
          {extras.poles && (
            <ExtraCard title="Poles">
              <TopBars entries={extras.poles} {...bars} />
            </ExtraCard>
          )}
          <ExtraCard title="Pontos por corrida" note="Mínimo de 50% das corridas">
            <TopBars entries={extras.points_per_race} format={(v) => formatDecimal(v)} {...bars} />
          </ExtraCard>
          {extras.completion_rate && (
            <ExtraCard title="Taxa de conclusão" note="Corridas terminadas, sem abandono ou desclassificação">
              <TopBars entries={extras.completion_rate} format={(v) => `${formatDecimal(v, 0)}%`} {...bars} />
            </ExtraCard>
          )}
          {extras.avg_gain && (
            <ExtraCard title="Ganho médio de posições" note="Largada − chegada">
              <TopBars
                entries={extras.avg_gain}
                format={(v) => (v > 0 ? `+${formatDecimal(v)}` : formatDecimal(v))}
                {...bars}
              />
            </ExtraCard>
          )}
          {extras.best_lap && (
            <ExtraCard title="Melhor volta" note="Menor tempo de volta no intervalo">
              <TopBars entries={extras.best_lap} format={(v) => formatLap(v)} lowerIsBetter {...bars} />
            </ExtraCard>
          )}
          <ExtraCard title="Maior sequência pontuando">
            <TopBars entries={extras.streaks.points} format={(v) => `${v} seguidas`} {...bars} />
          </ExtraCard>
          <ExtraCard title="Maior sequência de pódios">
            <TopBars
              entries={extras.streaks.podiums}
              format={(v) => `${v} seguidos`}
              empty="Ninguém repetiu pódio em sequência."
              {...bars}
            />
          </ExtraCard>
          {extras.evolution && (
            <ExtraCard title="Evolução na tabela" note="Maiores movimentos de uma etapa para a seguinte">
              <MoveList
                rises={extras.evolution.rises}
                falls={extras.evolution.falls}
                data={data}
                onOpen={open}
              />
            </ExtraCard>
          )}
        </div>

        {extras.gap_to_leader && extras.gap_to_leader.series.length > 1 && (
          <section className="panel cut mt-px p-4 sm:p-6">
            <ChartHeader
              title="Diferença para o líder"
              note="Pontos atrás do líder após cada etapa, entre os 5 primeiros"
            />
            <GapChart data={data} />
          </section>
        )}

        {extras.heatmap.rows.length > 0 && (
          <section className="panel cut mt-px p-4 sm:p-6">
            <ChartHeader
              title="Mapa de resultados"
              note="Melhor posição de chegada de cada piloto em cada etapa"
            />
            <Heatmap data={data} />
          </section>
        )}
      </div>

      <DriverModal
        slug={openSlug}
        category={category}
        upto={null}
        previous={neighbor(index - 1)}
        next={neighbor(index + 1)}
        onClose={close}
        onNavigate={navigate}
      />
    </div>
  );
}

function RangeSelect({
  label,
  value,
  events,
  onChange,
}: {
  label: string;
  value: number;
  events: number[];
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="num cut-sm appearance-none border border-line-strong bg-surface px-3 py-2.5 text-sm outline-none focus:border-red"
      >
        {events.map((n) => (
          <option key={n} value={n} className="bg-surface">
            E{n}
          </option>
        ))}
      </select>
    </label>
  );
}

function IndicatorCard({
  label,
  leader,
  value,
  unit,
  decimals,
  tone,
  note,
  children,
}: {
  label: string;
  leader: string;
  value: number;
  unit: string;
  decimals?: boolean;
  tone?: "fastest";
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col bg-surface p-5">
      <h2 className="eyebrow">{label}</h2>
      <div className="mt-3 flex items-baseline gap-2">
        <CountUp
          value={value}
          format={(n) => (decimals ? formatDecimal(n, 0) : String(Math.round(n)))}
          className={clsx("num text-5xl font-bold", tone === "fastest" ? "text-fastest" : "text-text")}
        />
        <span className="eyebrow">{unit}</span>
      </div>
      <p className="display mt-1 truncate text-xl font-bold">{leader}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      <div className="mt-5 border-t border-line pt-4">{children}</div>
    </article>
  );
}

function ExtraCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <article className="bg-surface p-5">
      <h3 className="display text-xl font-bold">{title}</h3>
      {note && <p className="text-xs text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </article>
  );
}

function ChartHeader({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-3">
      <h2 className="display text-2xl font-extrabold">{title}</h2>
      <p className="text-xs text-muted">{note}</p>
    </div>
  );
}

function MoveList({
  rises,
  falls,
  data,
  onOpen,
}: {
  rises: RankEntry[];
  falls: RankEntry[];
  data: Dashboard;
  onOpen: (slug: string) => void;
}) {
  const row = (m: RankEntry, up: boolean) => {
    const driver = data.drivers[String(m.driver_id)];
    if (!driver) return null;
    return (
      <li
        key={`${m.driver_id}-${m.event}`}
        className="flex items-center justify-between gap-3 py-1.5 text-sm"
      >
        <button
          type="button"
          onClick={() => onOpen(driver.slug)}
          className="truncate text-left hover:text-red"
        >
          {driver.name}
        </button>
        <span className="num shrink-0 text-xs text-muted">
          E{String(m.event)} · {String(m.from)}º→{String(m.to)}º{" "}
          <b className={up ? "text-up" : "text-red"}>
            {up ? "▲" : "▼"}
            {Math.abs(m.value)}
          </b>
        </span>
      </li>
    );
  };
  return (
    <div className="grid gap-3">
      <ul className="divide-y divide-line">{rises.slice(0, 3).map((m) => row(m, true))}</ul>
      <ul className="divide-y divide-line border-t border-line-strong pt-1">
        {falls.slice(0, 3).map((m) => row(m, false))}
      </ul>
    </div>
  );
}

function GapChart({ data }: { data: Dashboard }) {
  const option = useMemo(() => {
    const series = data.extras.gap_to_leader?.series ?? [];
    const shades = [
      CHART_THEME.red,
      "#FFFFFF",
      "rgba(255,255,255,0.65)",
      "rgba(255,255,255,0.45)",
      "rgba(255,255,255,0.3)",
    ];
    return {
      grid: { left: 40, right: 16, top: 36, bottom: 28 },
      legend: {
        top: 0,
        textStyle: { color: CHART_THEME.text, fontSize: 11 },
        itemWidth: 14,
        itemHeight: 2,
        icon: "rect",
      },
      tooltip: {
        trigger: "axis",
        ...CHART_THEME.tooltip,
        valueFormatter: (v: number) => (v ? `−${formatPoints(v)}` : "líder"),
      },
      xAxis: {
        type: "category",
        data: data.events.map((n) => `E${n}`),
        boundaryGap: false,
        axisLine: { lineStyle: { color: CHART_THEME.line } },
        axisLabel: { color: CHART_THEME.text, fontFamily: CHART_THEME.mono, fontSize: 11 },
      },
      yAxis: {
        type: "value",
        inverse: true,
        name: "pts atrás",
        nameTextStyle: { color: CHART_THEME.text, fontSize: 10 },
        splitLine: { lineStyle: { color: CHART_THEME.line } },
        axisLabel: { color: CHART_THEME.text, fontFamily: CHART_THEME.mono, fontSize: 11 },
      },
      series: series.map((s, i) => ({
        name: data.drivers[String(s.driver_id)]?.name ?? "",
        type: "line",
        data: s.values,
        smooth: 0.2,
        connectNulls: true,
        symbolSize: 5,
        lineStyle: {
          width: i === 0 ? 2.5 : 1.5,
          color: shades[i],
          ...(i === 0 ? { shadowColor: CHART_THEME.redGlow, shadowBlur: 12 } : {}),
        },
        itemStyle: { color: shades[i] },
      })),
    };
  }, [data]);
  return (
    <EChart
      option={option}
      className="h-72 w-full"
      ariaLabel="Diferença de pontos para o líder ao longo das etapas"
    />
  );
}

function Heatmap({ data }: { data: Dashboard }) {
  const { rows, events } = data.extras.heatmap;
  const option = useMemo(() => {
    const names = rows.map((r) => data.drivers[String(r.driver_id)]?.name ?? "");
    const points: [number, number, number | null][] = [];
    rows.forEach((row, y) => row.positions.forEach((p, x) => points.push([x, y, p])));
    const maxPos = Math.max(10, ...points.map((p) => p[2] ?? 0));
    return {
      grid: { left: 150, right: 12, top: 8, bottom: 56 },
      tooltip: {
        ...CHART_THEME.tooltip,
        formatter: (p: { value: [number, number, number | null] }) =>
          `${names[p.value[1]]}<br/><span style="font-family:${CHART_THEME.mono}">E${events[p.value[0]]} · ${p.value[2] ? `P${p.value[2]}` : "não correu"}</span>`,
      },
      xAxis: {
        type: "category",
        data: events.map((n) => `E${n}`),
        splitArea: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: CHART_THEME.text, fontFamily: CHART_THEME.mono, fontSize: 11 },
      },
      yAxis: {
        type: "category",
        data: names,
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#FFFFFF", fontSize: 12, width: 140, overflow: "truncate" },
      },
      visualMap: {
        min: 1,
        max: maxPos,
        calculable: false,
        orient: "horizontal",
        left: "center",
        bottom: 4,
        itemHeight: 160,
        itemWidth: 10,
        text: [`P${maxPos}`, "P1"],
        textStyle: { color: CHART_THEME.text, fontSize: 10 },
        inRange: { color: ["#E10613", "#7A0A12", "#2A1A1D", "#18181C"] },
      },
      series: [
        {
          type: "heatmap",
          data: points.filter((p) => p[2] !== null),
          label: {
            show: true,
            color: "#FFFFFF",
            fontFamily: CHART_THEME.mono,
            fontSize: 10,
            formatter: (p: { value: number[] }) => p.value[2],
          },
          itemStyle: { borderColor: "#0A0A0B", borderWidth: 2 },
          emphasis: { itemStyle: { shadowBlur: 12, shadowColor: CHART_THEME.redGlow } },
        },
      ],
    };
  }, [rows, events, data.drivers]);
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <EChart
        option={option}
        className="min-w-[560px]"
        style={{ height: Math.max(240, rows.length * 26 + 70) }}
        ariaLabel="Mapa de resultados: posição de chegada de cada piloto em cada etapa"
      />
    </div>
  );
}
