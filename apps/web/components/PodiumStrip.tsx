"use client";

import clsx from "clsx";
import { motion } from "motion/react";

import { formatPoints, initials } from "@/lib/format";
import { useReducedMotion } from "@/lib/motion";
import type { StandingRow } from "@/lib/types";

/**
 * Faixa do pódio: os 3 primeiros da categoria com foto, na ordem do pódio (2º, 1º, 3º).
 * É a única peça do site em que a foto do piloto aparece grande; o resto continua sendo a tabela.
 */
export function PodiumStrip({
  rows,
  onOpen,
  onHover,
}: {
  rows: StandingRow[];
  onOpen: (slug: string) => void;
  onHover: (slug: string) => void;
}) {
  const reduced = useReducedMotion();
  const top3 = rows.slice(0, 3);
  if (top3.length < 3) return null;
  const order = [top3[1], top3[0], top3[2]];

  return (
    <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
      {order.map((row, i) => {
        const first = row.position === 1;
        const driver = row.driver;
        return (
          <motion.button
            key={driver.id}
            type="button"
            disabled={driver.hidden}
            onClick={() => onOpen(driver.slug)}
            onPointerEnter={() => onHover(driver.slug)}
            onFocus={() => onHover(driver.slug)}
            // Só desliza: o conteúdo nasce visível, para não atrasar a primeira pintura da página.
            initial={reduced ? false : { y: 16 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.08, ease: [0.2, 0.7, 0.2, 1] }}
            whileHover={reduced ? undefined : { y: -4 }}
            className={clsx(
              "cut-sm group relative flex flex-col justify-end overflow-hidden border text-left transition-colors",
              first
                ? "h-[9.5rem] border-red shadow-[0_0_28px_-6px_var(--red-glow)] sm:h-[15rem] lg:h-[17rem]"
                : "h-[8rem] border-line-strong hover:border-white/40 sm:h-[12.5rem] lg:h-[14rem]",
            )}
          >
            {driver.photo_lg || driver.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={driver.photo_lg ?? driver.photo ?? ""}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <span
                aria-hidden
                className="display absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-2 to-bg text-5xl font-extrabold text-white/10 sm:text-7xl"
              >
                {initials(driver.name)}
              </span>
            )}
            <span
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-transparent"
              style={{ backgroundSize: "100% 100%" }}
            />
            <span
              aria-hidden
              className={clsx(
                "display absolute left-2 top-1 text-4xl font-extrabold leading-none sm:left-3 sm:text-6xl",
                first ? "text-red" : "text-white/70",
              )}
            >
              {row.position}
            </span>
            <span className="relative p-2 sm:p-3">
              <span className="display block truncate text-sm font-bold leading-tight sm:text-xl">
                {driver.name}
              </span>
              <span className="num mt-0.5 flex items-baseline gap-1.5">
                <span className={clsx("text-base font-bold sm:text-2xl", first && "text-red")}>
                  {formatPoints(row.points)}
                </span>
                <span className="eyebrow !text-[9px] sm:!text-[10px]">pts</span>
              </span>
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
