"use client";

import type { EChartsCoreOption, EChartsType } from "echarts/core";
import { useEffect, useRef } from "react";

import { useReducedMotion } from "@/lib/motion";

let loader: Promise<typeof import("echarts/core")> | null = null;

/** Carrega só os módulos usados do ECharts, fora do carregamento inicial da página. */
function loadECharts() {
  loader ??= (async () => {
    const echarts = await import("echarts/core");
    const [{ LineChart, HeatmapChart }, components, { CanvasRenderer }] = await Promise.all([
      import("echarts/charts"),
      import("echarts/components"),
      import("echarts/renderers"),
    ]);
    echarts.use([
      LineChart,
      HeatmapChart,
      components.GridComponent,
      components.TooltipComponent,
      components.VisualMapComponent,
      components.MarkLineComponent,
      components.LegendComponent,
      CanvasRenderer,
    ]);
    return echarts;
  })();
  return loader;
}

export function EChart({
  option,
  className,
  ariaLabel,
  onReady,
  style,
}: {
  option: EChartsCoreOption;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel: string;
  onReady?: (chart: EChartsType) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    loadECharts().then((echarts) => {
      if (disposed || !ref.current) return;
      const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
      chartRef.current = chart;
      observer = new ResizeObserver(() => chart.resize());
      observer.observe(ref.current);
      onReady?.(chart);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const apply = () => {
      if (cancelled) return;
      if (!chartRef.current) {
        requestAnimationFrame(apply);
        return;
      }
      chartRef.current.setOption({ animation: !reduced, ...option }, { notMerge: false, lazyUpdate: true });
    };
    apply();
    return () => {
      cancelled = true;
    };
  }, [option, reduced]);

  return <div ref={ref} role="img" aria-label={ariaLabel} className={className} style={style} />;
}

export const CHART_THEME = {
  text: "#9A9AA3",
  line: "rgba(255,255,255,0.08)",
  red: "#E10613",
  redGlow: "rgba(225,6,19,0.45)",
  white: "#FFFFFF",
  mono: "JetBrains Mono, ui-monospace, monospace",
  tooltip: {
    backgroundColor: "rgba(10,10,12,0.92)",
    borderColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: "#FFFFFF", fontFamily: "Barlow Semi Condensed, sans-serif", fontSize: 13 },
    extraCssText: "backdrop-filter: blur(8px); border-radius: 0; box-shadow: 0 0 20px rgba(225,6,19,0.25);",
  },
};
