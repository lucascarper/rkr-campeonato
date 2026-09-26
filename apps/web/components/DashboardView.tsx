"use client";

import clsx from "clsx";
import { useCallback, useMemo, useState } from "react";

import { fetchJSON, prefetchDriver } from "@/lib/client";
import { formatDecimal, formatLap, formatPoints, shortName } from "@/lib/format";
import type { Dashboard, RankEntry } from "@/lib/types";
import { useDriverParam } from "@/lib/useDriverParam";

import { CountUp } from "./CountUp";
import { Reveal } from "./Reveal";
import { StageHighlights } from "./StageHighlights";
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
  const photo = (entry?: RankEntry) =>
    entry ? (data.drivers[String(entry.driver_id)]?.photo_lg ?? null) : null;
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
        {data.highlights && (
          <StageHighlights highlights={data.highlights} drivers={data.drivers} onOpen={open} />
        )}

        {/* Indicadores obrigatórios */}
        <section
          aria-label="Indicadores principais"
          className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4"
        >
          <IndicatorCard
            label="Mais voltas rápidas"
            leader={name(indicators.fastest_laps.top[0])}
            photo={photo(indicators.fastest_laps.top[0])}
            value={indicators.fastest_laps.top[0]?.value ?? 0}
            unit="VR"
            tone="fastest"
          >
            <TopBars entries={indicators.fastest_laps.top} tone="fastest" {...bars} />
          </IndicatorCard>
          <IndicatorCard
            label="Mais vitórias"
            leader={name(indicators.wins.top[0])}
            photo={photo(indicators.wins.top[0])}
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
            photo={photo(indicators.consistency.top[0])}
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
            photo={photo(indicators.penalties.top[0])}
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
        <div className="mt-4 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-6">
          <ExtraCard
            title="Pódios"
            span={3}
            delay={0}
            note={`Chegadas entre os ${data.podium_positions} primeiros`}
          >
            <TopBars entries={extras.podiums} {...bars} />
          </ExtraCard>
          <ExtraCard
            title="Posição média de chegada"
            span={3}
            delay={0.05}
            note="Menor é melhor · mínimo de 50% das corridas"
          >
            <TopBars entries={extras.avg_position} format={(v) => formatDecimal(v)} lowerIsBetter {...bars} />
          </ExtraCard>
          {extras.poles && (
            <ExtraCard title="Poles" span={2} delay={0}>
              <TopBars entries={extras.poles} {...bars} />
            </ExtraCard>
          )}
          <ExtraCard title="Pontos por corrida" span={2} delay={0.05} note="Mínimo de 50% das corridas">
            <TopBars entries={extras.points_per_race} format={(v) => formatDecimal(v)} {...bars} />
          </ExtraCard>
          {extras.completion_rate && (
            <ExtraCard
              title="Taxa de conclusão"
              span={2}
              delay={0.1}
              note="Corridas terminadas, sem abandono ou desclassificação"
            >
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
            <ExtraCard title="Melhor volta" span={2} delay={0} note="Menor tempo de volta no intervalo">
              <TopBars entries={extras.best_lap} format={(v) => formatLap(v)} lowerIsBetter {...bars} />
            </ExtraCard>
          )}
          <ExtraCard title="Maior sequência pontuando" span={2} delay={0.05}>
            <TopBars entries={extras.streaks.points} format={(v) => `${v} seguidas`} {...bars} />
          </ExtraCard>
          <ExtraCard
            title="Maior sequência de pódios"
            span={2}
            delay={0.1}
            note={`Etapas seguidas terminando entre os ${data.podium_positions} primeiros`}
          >
            <TopBars
              entries={extras.streaks.podiums}
              format={(v) => `${v} seguidos`}
              empty="Ninguém repetiu pódio em sequência."
              {...bars}
            />
          </ExtraCard>
          {extras.evolution && (
            <ExtraCard
              title="Evolução na tabela"
              span={3}
              delay={0}
              note="Maiores movimentos de uma etapa para a seguinte"
            >
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
              note="Pontos atrás do líder após cada etapa, entre os 5 primeiros. Toque num piloto para destacar."
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
        drivers={order.map((d) => ({ slug: d.slug, name: d.name }))}
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
  photo,
  value,
  unit,
  decimals,
  tone,
  note,
  children,
}: {
  label: string;
  leader: string;
  photo?: string | null;
  value: number;
  unit: string;
  decimals?: boolean;
  tone?: "fastest";
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="relative flex flex-col overflow-hidden bg-surface p-5">
      {/* Foto do líder do indicador, esmaecida e dissolvida na borda. */}
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-3 -top-2 h-44 w-32 object-cover object-top opacity-30 [mask-image:linear-gradient(200deg,#000,transparent_72%)]"
        />
      )}
      <h2 className="eyebrow relative">{label}</h2>
      <div className="relative mt-3 flex items-baseline gap-2">
        <CountUp
          value={value}
          format={(n) => (decimals ? formatDecimal(n, 0) : String(Math.round(n)))}
          className={clsx("num text-5xl font-bold", tone === "fastest" ? "text-fastest" : "text-text")}
        />
        <span className="eyebrow">{unit}</span>
      </div>
      <p className="display relative mt-1 truncate text-xl font-bold">{leader}</p>
      {note && <p className="relative mt-1 text-xs text-muted">{note}</p>}
      <div className="relative mt-5 border-t border-line pt-4">{children}</div>
    </article>
  );
}

function ExtraCard({
  title,
  note,
  span = 2,
  delay = 0,
  children,
}: {
  title: string;
  note?: string;
  /** Colunas ocupadas na grade de 6 do desktop: dá ritmo em vez de cartões todos iguais. */
  span?: 2 | 3;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <Reveal
      as="section"
      delay={delay}
      className={clsx("bg-surface p-5", span === 3 ? "lg:col-span-3" : "lg:col-span-2")}
    >
      <h3 className="display text-xl font-bold">{title}</h3>
      {note && <p className="text-xs text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </Reveal>
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

/**
 * Diferença para o líder: um piloto destacado por vez (vermelho, grosso, com pontos) e os demais
 * como contexto em cinza fino. A escolha é feita por botões acima do gráfico, e não pela legenda
 * do ECharts, que no celular quebrava em linhas sobre o eixo e confundia ligado/desligado.
 */
function GapChart({ data }: { data: Dashboard }) {
  const series = useMemo(() => data.extras.gap_to_leader?.series ?? [], [data]);
  const [focusId, setFocusId] = useState<number | null>(null);
  const focused = series.find((s) => s.driver_id === focusId)?.driver_id ?? series[0]?.driver_id;
  const lastValue = (values: (number | null)[]) => [...values].reverse().find((v) => v !== null) ?? null;

  const option = useMemo(() => {
    const names = series.map((s) => data.drivers[String(s.driver_id)]?.name ?? "");
    const order = [...series.keys()].sort(
      (a, b) => Number(series[a].driver_id === focused) - Number(series[b].driver_id === focused),
    ); // destacado desenhado por último, por cima
    return {
      grid: { left: 36, right: 14, top: 12, bottom: 28 },
      tooltip: {
        trigger: "axis",
        ...CHART_THEME.tooltip,
        formatter: (params: { dataIndex: number; seriesIndex: number }[]) => {
          const index = params[0]?.dataIndex ?? 0;
          const rows = series
            .map((s, i) => ({ name: names[i], value: s.values[index], mine: s.driver_id === focused }))
            .filter((r) => r.value !== null && r.value !== undefined)
            .sort((a, b) => (a.value as number) - (b.value as number))
            .map(
              (r) =>
                `<div style="display:flex;justify-content:space-between;gap:16px;${r.mine ? "color:#fff;font-weight:600" : "color:#9A9AA3"}">` +
                `<span>${r.mine ? "● " : ""}${r.name}</span>` +
                `<span style="font-family:${CHART_THEME.mono}">${r.value ? `−${formatPoints(r.value as number)}` : "líder"}</span></div>`,
            )
            .join("");
          return `<div style="font-family:${CHART_THEME.mono};font-size:11px;letter-spacing:.12em;color:#9A9AA3;margin-bottom:4px">APÓS E${data.events[index]}</div>${rows}`;
        },
      },
      xAxis: {
        type: "category",
        data: data.events.map((n) => `E${n}`),
        boundaryGap: false,
        axisLine: { lineStyle: { color: CHART_THEME.line } },
        axisTick: { show: false },
        axisLabel: { color: CHART_THEME.text, fontFamily: CHART_THEME.mono, fontSize: 11 },
      },
      yAxis: {
        type: "value",
        inverse: true,
        splitLine: { lineStyle: { color: CHART_THEME.line } },
        axisLabel: { color: CHART_THEME.text, fontFamily: CHART_THEME.mono, fontSize: 11 },
      },
      series: order.map((i) => {
        const mine = series[i].driver_id === focused;
        return {
          id: String(series[i].driver_id),
          name: names[i],
          type: "line",
          data: series[i].values,
          smooth: 0.2,
          connectNulls: true,
          z: mine ? 10 : 2,
          symbol: "circle",
          symbolSize: mine ? 7 : 0,
          showSymbol: mine,
          lineStyle: mine
            ? { width: 3, color: CHART_THEME.red, shadowColor: CHART_THEME.redGlow, shadowBlur: 12 }
            : { width: 1.25, color: "rgba(255,255,255,0.22)", shadowBlur: 0 },
          itemStyle: mine
            ? { color: "#FFFFFF", borderColor: CHART_THEME.red, borderWidth: 2 }
            : { color: "rgba(255,255,255,0.22)", borderColor: "transparent", borderWidth: 0 }, // zera o destaque anterior (setOption mescla)
          emphasis: { disabled: true },
        };
      }),
    };
  }, [series, focused, data]);

  return (
    <div>
      <div role="group" aria-label="Destacar piloto no gráfico" className="mb-3 flex flex-wrap gap-2">
        {series.map((s, i) => {
          const driver = data.drivers[String(s.driver_id)];
          const active = s.driver_id === focused;
          const gap = lastValue(s.values);
          return (
            <button
              key={s.driver_id}
              type="button"
              aria-pressed={active}
              onClick={() => setFocusId(s.driver_id)}
              className={clsx(
                "cut-sm flex min-w-0 items-center gap-1.5 border px-2 py-1 text-left text-xs transition-colors sm:gap-2 sm:px-2.5 sm:py-1.5 sm:text-sm",
                active
                  ? "border-red bg-red-soft text-text"
                  : "border-line-strong text-muted hover:border-white/40 hover:text-text",
              )}
            >
              <span className="num text-xs text-faint">{i + 1}</span>
              <span
                className={clsx("h-[3px] w-3 shrink-0 sm:w-4", active ? "bg-red" : "bg-white/25")}
                aria-hidden
              />
              <span className="max-w-[8rem] truncate sm:max-w-[12rem]" title={driver?.name}>
                <span className="sm:hidden">{shortName(driver?.name ?? "")}</span>
                <span className="hidden sm:inline">{driver?.name}</span>
              </span>
              <span className={clsx("num text-xs", active ? "text-red" : "text-faint")}>
                {gap ? `−${formatPoints(gap)}` : "líder"}
              </span>
            </button>
          );
        })}
      </div>
      <EChart
        option={option}
        className="h-64 w-full sm:h-72"
        ariaLabel={`Diferença de pontos para o líder ao longo das etapas, destacando ${
          data.drivers[String(focused)]?.name ?? ""
        }`}
      />
    </div>
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
