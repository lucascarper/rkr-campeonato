"use client";

import { useMemo } from "react";

import { formatDate, formatPoints, statusLabel } from "@/lib/format";
import type { DriverProfile } from "@/lib/types";

import { CHART_THEME, EChart } from "./EChart";

/** Pontuação acumulada por etapa. Na visão "com descarte", as etapas descartadas ficam esmaecidas. */
export function DriverChart({ profile, withDiscard }: { profile: DriverProfile; withDiscard: boolean }) {
  const option = useMemo(() => {
    const { series, races } = profile;
    const discardedEvents = new Set(series.discarded_events);
    const values = withDiscard ? series.with_discard : series.no_discard;
    const info = new Map(series.event_info.map((e) => [e.number, e]));

    const data = series.events.map((event, i) => {
      const faded = withDiscard && discardedEvents.has(event);
      const ran = races.some((r) => r.event === event);
      return {
        value: values[i],
        symbol: faded ? "emptyCircle" : ran ? "circle" : "emptyCircle",
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
                withDiscard && r.discarded ? ' <span style="color:#9A9AA3">(descartada)</span>' : "";
              const pos =
                r.status === "FIN" || r.status === "DNF" ? `P${r.position ?? "—"}` : statusLabel(r.status);
              return `<div style="display:flex;justify-content:space-between;gap:16px"><span>${r.label}</span><span style="font-family:${CHART_THEME.mono}">${pos} · ${formatPoints(r.points)} pts${pen}${faded}</span></div>`;
            })
            .join("")
        : '<div style="color:#9A9AA3">Não correu nesta etapa</div>';
      return `<div style="min-width:200px">
        <div style="font-family:${CHART_THEME.mono};font-size:11px;letter-spacing:.12em;color:#9A9AA3;text-transform:uppercase">Etapa ${event} · ${formatDate(meta?.date)}</div>
        <div style="margin:2px 0 6px;color:#9A9AA3">${meta?.location ?? ""}</div>
        ${lines}
        <div style="margin-top:6px;border-top:1px solid rgba(255,255,255,.12);padding-top:6px;display:flex;justify-content:space-between">
          <span>Acumulado</span><b style="font-family:${CHART_THEME.mono}">${formatPoints(values[index])}</b>
        </div>
        ${series.positions[index] ? `<div style="display:flex;justify-content:space-between;color:#9A9AA3"><span>Posição no campeonato</span><span style="font-family:${CHART_THEME.mono}">${series.positions[index]}º</span></div>` : ""}
      </div>`;
    };

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
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: CHART_THEME.line } },
        axisLabel: { color: CHART_THEME.text, fontFamily: CHART_THEME.mono, fontSize: 11 },
      },
      series: [
        {
          // Linha fantasma "sem descarte" para comparar, só na visão com descarte
          name: "Sem descarte",
          type: "line",
          data: withDiscard ? series.no_discard : [],
          symbol: "none",
          lineStyle: { color: "rgba(255,255,255,0.18)", width: 1, type: "dashed" },
          silent: true,
          z: 1,
        },
        {
          name: withDiscard ? "Com descarte" : "Sem descarte",
          type: "line",
          data,
          smooth: 0.25,
          lineStyle: { color: CHART_THEME.red, width: 2.5, shadowColor: CHART_THEME.redGlow, shadowBlur: 14 },
          areaStyle: {
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
          z: 2,
        },
      ],
    };
  }, [profile, withDiscard]);

  return (
    <EChart
      option={option}
      className="h-56 w-full sm:h-64"
      ariaLabel={`Pontuação acumulada de ${profile.driver.name} por etapa, ${withDiscard ? "com" : "sem"} descarte`}
    />
  );
}
