"use client";

import { useMemo } from "react";

import { formatDate, formatPoints, shortName, statusLabel } from "@/lib/format";
import type { DriverProfile } from "@/lib/types";

import { CHART_THEME, EChart } from "./EChart";

export type ChartMode = "points" | "position";

const COMPARE = "rgba(255,255,255,0.75)";

/**
 * Evolução do piloto por etapa.
 * - "points": pontuação acumulada; com descarte, as etapas descartadas ficam esmaecidas.
 * - "position": posição no campeonato após cada etapa (1º no topo).
 * Com `compare`, a linha de outro piloto aparece em branco para comparação.
 */
export function DriverChart({
  profile,
  withDiscard,
  mode,
  compare,
}: {
  profile: DriverProfile;
  withDiscard: boolean;
  mode: ChartMode;
  compare?: DriverProfile | null;
}) {
  const option = useMemo(() => {
    const { series, races } = profile;
    const discardedEvents = new Set(series.discarded_events);
    const info = new Map(series.event_info.map((e) => [e.number, e]));
    const positionMode = mode === "position";
    const values = positionMode ? series.positions : withDiscard ? series.with_discard : series.no_discard;

    // Série do piloto comparado, alinhada pelas etapas do piloto principal.
    const compareValues = compare
      ? series.events.map((event) => {
          const i = compare.series.events.indexOf(event);
          if (i < 0) return null;
          if (positionMode) return compare.series.positions[i];
          return (withDiscard ? compare.series.with_discard : compare.series.no_discard)[i];
        })
      : [];

    const data = series.events.map((event, i) => {
      const faded = !positionMode && withDiscard && discardedEvents.has(event);
      const ran = races.some((r) => r.event === event);
      return {
        value: values[i],
        symbol: faded || !ran ? "emptyCircle" : "circle",
        symbolSize: faded ? 9 : 7,
        itemStyle: faded
          ? { color: "#5C5C66", borderColor: "#5C5C66", opacity: 0.8 }
          : {
              color: ran ? CHART_THEME.white : "#5C5C66",
              borderColor: CHART_THEME.red,
              borderWidth: ran ? 2 : 1,
            },
      };
    });

    const unit = (v: number | null | undefined) =>
      v === null || v === undefined ? "—" : positionMode ? `${v}º` : `${formatPoints(v)} pts`;

    const tooltip = (index: number) => {
      const event = series.events[index];
      const meta = info.get(event);
      const eventRaces = races.filter((r) => r.event === event);
      const lines = eventRaces.length
        ? eventRaces
            .map((r) => {
              const pen = r.penalties.length
                ? ` · <span style="color:#E10613">${r.penalties.map((p) => (p.seconds ? `+${p.seconds}s` : p.kind)).join(", ")}</span>`
                : "";
              const faded =
                withDiscard && !positionMode && r.discarded
                  ? ' <span style="color:#9A9AA3">(descartada)</span>'
                  : "";
              const pos =
                r.status === "FIN" || r.status === "DNF" ? `P${r.position ?? "—"}` : statusLabel(r.status);
              return `<div style="display:flex;justify-content:space-between;gap:16px"><span>${r.label}</span><span style="font-family:${CHART_THEME.mono}">${pos} · ${formatPoints(r.points)} pts${pen}${faded}</span></div>`;
            })
            .join("")
        : `<div style="color:#9A9AA3">Não correu nesta etapa${
            withDiscard && !positionMode && profile.absences?.some((a) => a.event === event && a.discarded)
              ? " (falta descartada)"
              : ""
          }</div>`;
      const label = positionMode ? "Posição no campeonato" : "Acumulado";
      const compareLine = compare
        ? `<div style="display:flex;justify-content:space-between;gap:16px;color:${COMPARE}"><span>${shortName(compare.driver.name)}</span><span style="font-family:${CHART_THEME.mono}">${unit(compareValues[index])}</span></div>`
        : "";
      return `<div style="min-width:210px">
        <div style="font-family:${CHART_THEME.mono};font-size:11px;letter-spacing:.12em;color:#9A9AA3;text-transform:uppercase">Etapa ${event} · ${formatDate(meta?.date)}</div>
        <div style="margin:2px 0 6px;color:#9A9AA3">${meta?.location ?? ""}</div>
        ${lines}
        <div style="margin-top:6px;border-top:1px solid rgba(255,255,255,.12);padding-top:6px;display:flex;justify-content:space-between;gap:16px">
          <span>${compare ? shortName(profile.driver.name) : label}</span><b style="font-family:${CHART_THEME.mono}">${unit(values[index])}</b>
        </div>
        ${compareLine}
      </div>`;
    };

    const maxPosition = Math.max(
      profile.total_drivers || 1,
      ...series.positions.filter((p): p is number => p !== null),
      ...(compare ? compare.series.positions.filter((p): p is number => p !== null) : []),
    );

    return {
      grid: { left: 36, right: 12, top: 16, bottom: 28 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: "rgba(225,6,19,0.5)", type: "dashed" } },
        formatter: (params: { dataIndex: number }[]) => tooltip(params[0].dataIndex),
        ...CHART_THEME.tooltip,
      },
      xAxis: {
        type: "category",
        data: series.events.map((n) => `E${n}`),
        boundaryGap: false,
        axisLine: { lineStyle: { color: CHART_THEME.line } },
        axisTick: { show: false },
        axisLabel: { color: CHART_THEME.text, fontFamily: CHART_THEME.mono, fontSize: 11 },
      },
      yAxis: positionMode
        ? {
            type: "value",
            inverse: true,
            min: 1,
            max: maxPosition,
            minInterval: 1,
            splitLine: { lineStyle: { color: CHART_THEME.line } },
            axisLabel: {
              color: CHART_THEME.text,
              fontFamily: CHART_THEME.mono,
              fontSize: 11,
              formatter: (v: number) => `${v}º`,
            },
          }
        : {
            type: "value",
            splitLine: { lineStyle: { color: CHART_THEME.line } },
            axisLabel: { color: CHART_THEME.text, fontFamily: CHART_THEME.mono, fontSize: 11 },
          },
      series: [
        {
          // Linha fantasma "sem descarte" para comparar, só na visão de pontos com descarte
          id: "ghost",
          type: "line",
          data: !positionMode && withDiscard ? series.no_discard : [],
          symbol: "none",
          lineStyle: { color: "rgba(255,255,255,0.18)", width: 1, type: "dashed" },
          silent: true,
          z: 1,
        },
        {
          id: "compare",
          type: "line",
          data: compareValues,
          connectNulls: true,
          smooth: 0.25,
          symbol: "circle",
          symbolSize: 5,
          lineStyle: { color: COMPARE, width: 1.75 },
          itemStyle: { color: COMPARE },
          z: 2,
        },
        {
          id: "main",
          type: "line",
          data,
          connectNulls: true,
          smooth: 0.25,
          lineStyle: { color: CHART_THEME.red, width: 2.5, shadowColor: CHART_THEME.redGlow, shadowBlur: 14 },
          areaStyle: positionMode
            ? { opacity: 0 }
            : {
                opacity: 1,
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: "rgba(225,6,19,0.32)" },
                    { offset: 1, color: "rgba(225,6,19,0)" },
                  ],
                },
              },
          animationDuration: 900,
          animationEasing: "cubicOut",
          z: 3,
        },
      ],
    };
  }, [profile, withDiscard, mode, compare]);

  return (
    // Trocar de modo recria o gráfico: os eixos dos dois modos são diferentes demais para mesclar.
    <EChart
      key={mode}
      option={option}
      className="h-56 w-full sm:h-64"
      ariaLabel={
        mode === "position"
          ? `Posição de ${profile.driver.name} no campeonato após cada etapa`
          : `Pontuação acumulada de ${profile.driver.name} por etapa, ${withDiscard ? "com" : "sem"} descarte`
      }
    />
  );
}
