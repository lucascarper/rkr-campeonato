"use client";

import clsx from "clsx";
import { useEffect, useRef } from "react";

import { formatDate } from "@/lib/format";
import type { EventInfo } from "@/lib/types";

/** Faixa de etapas (E1 … E8): escolhe até qual etapa a classificação é mostrada. */
export function StageBar({
  cuts,
  calendar,
  selected,
  onSelect,
}: {
  cuts: number[];
  calendar: EventInfo[];
  selected: number | null;
  onSelect: (n: number) => void;
}) {
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // No celular a faixa rola na horizontal: mantém a etapa escolhida à vista.
    active.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);

  if (!cuts.length) return null;
  return (
    <div
      role="group"
      aria-label="Classificação até a etapa"
      className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
    >
      <div className="flex w-max gap-1.5">
        {cuts.map((n) => {
          const event = calendar.find((e) => e.number === n);
          const on = n === selected;
          return (
            <button
              key={n}
              ref={on ? active : undefined}
              type="button"
              aria-pressed={on}
              onClick={() => !on && onSelect(n)}
              title={event ? `${event.location} · ${formatDate(event.date)}` : undefined}
              className={clsx(
                "cut-sm flex h-10 min-w-[3rem] flex-col items-center justify-center border px-2.5 leading-none transition-colors active:scale-[0.97]",
                on
                  ? "border-red bg-red text-white shadow-[0_0_18px_-4px_var(--red-glow)]"
                  : "border-line-strong bg-surface text-muted hover:border-white/40 hover:text-text",
              )}
            >
              <span className="display text-lg font-extrabold">E{n}</span>
              {event?.preseason && (
                <span
                  className={clsx(
                    "num mt-0.5 text-[8px] tracking-widest",
                    on ? "text-white/80" : "text-faint",
                  )}
                >
                  PRÉ
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
