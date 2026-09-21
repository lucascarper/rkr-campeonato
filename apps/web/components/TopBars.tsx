"use client";

import clsx from "clsx";
import { motion } from "motion/react";

import { useReducedMotion } from "@/lib/motion";
import type { DriverRef, RankEntry } from "@/lib/types";

/** Top N com barras horizontais e o valor em fonte monoespaçada. */
export function TopBars({
  entries,
  drivers,
  format = (v) => String(v),
  detail,
  lowerIsBetter = false,
  tone = "red",
  onOpen,
  onHover,
  empty = "Ainda sem dados neste intervalo.",
}: {
  entries: RankEntry[];
  drivers: Record<string, DriverRef>;
  format?: (value: number) => string;
  detail?: (entry: RankEntry) => string | null;
  lowerIsBetter?: boolean;
  tone?: "red" | "fastest";
  onOpen: (slug: string) => void;
  onHover?: (slug: string) => void;
  empty?: string;
}) {
  const reduced = useReducedMotion();
  if (!entries.length) return <p className="py-4 text-sm text-muted">{empty}</p>;
  const values = entries.map((e) => Math.abs(e.value));
  const max = Math.max(...values) || 1;
  const min = Math.min(...values) || 1;

  return (
    <ol className="flex flex-col gap-2.5">
      {entries.map((entry, index) => {
        const driver = drivers[String(entry.driver_id)];
        if (!driver) return null;
        const ratio = lowerIsBetter ? min / Math.abs(entry.value || 1) : Math.abs(entry.value) / max;
        const extra = detail?.(entry);
        return (
          <li
            key={`${entry.driver_id}-${index}`}
            className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-x-3"
          >
            <span className="num text-xs text-muted">{index + 1}</span>
            <div className="min-w-0">
              <button
                type="button"
                disabled={driver.hidden}
                onClick={() => onOpen(driver.slug)}
                onPointerEnter={() => onHover?.(driver.slug)}
                className="block max-w-full truncate text-left text-sm font-medium transition-colors hover:text-red disabled:hover:text-text"
              >
                {driver.name}
              </button>
              <div className="mt-1 h-1.5 w-full bg-line">
                <motion.div
                  className={clsx(
                    "h-full",
                    tone === "fastest"
                      ? "bg-fastest"
                      : index === 0
                        ? "bg-red shadow-[0_0_10px_var(--red-glow)]"
                        : "bg-white/35",
                  )}
                  initial={reduced ? false : { width: 0 }}
                  whileInView={{ width: `${Math.max(4, ratio * 100)}%` }}
                  style={reduced ? { width: `${Math.max(4, ratio * 100)}%` } : undefined}
                  viewport={{ once: true }}
                  transition={{ duration: 0.7, delay: index * 0.06, ease: [0.2, 0.7, 0.2, 1] }}
                />
              </div>
            </div>
            <span className="num text-right text-sm font-bold">
              {format(entry.value)}
              {extra && <span className="block text-[10px] font-normal text-muted">{extra}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
