"use client";

import {
  type CellContext,
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatDate, formatPoints } from "@/lib/format";
import { useReducedMotion } from "@/lib/motion";
import type { EventInfo, StandingRow } from "@/lib/types";

import { DriverAvatar } from "./DriverAvatar";
import { Ticker } from "./Ticker";

/**
 * Variação de posição em relação à etapa anterior. Ao trocar a etapa o elemento é recriado e
 * dá um brilho: verde para quem subiu, vermelho para quem caiu.
 */
function Delta({ value, delay, reduced }: { value: number | null; delay: number; reduced: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const animate = value !== null && value !== 0 && !reduced;
  useEffect(() => {
    if (!animate) return;
    const animation = ref.current?.animate(
      [
        { transform: "scale(1.5)", textShadow: "0 0 12px currentColor" },
        { transform: "none", textShadow: "0 0 0 transparent" },
      ],
      { duration: 900, delay: delay * 1000, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
    );
    return () => animation?.cancel();
  }, [animate, delay]);

  if (value === null) return <span className="text-faint">·</span>;
  if (value === 0) return <span className="text-faint">–</span>;
  const up = value > 0;
  return (
    <span ref={ref} className={clsx("inline-flex items-center gap-0.5", up ? "text-up" : "text-red")}>
      <svg viewBox="0 0 8 8" className={clsx("h-2 w-2", !up && "rotate-180")} aria-hidden>
        <path d="M4 1 7.5 7H.5Z" fill="currentColor" />
      </svg>
      {Math.abs(value)}
      <span className="sr-only">{up ? " posições acima" : " posições abaixo"}</span>
    </span>
  );
}

/**
 * Dados que mudam a cada render (etapa escolhida, destaques, callbacks) vão por `meta` da tabela.
 * As células abaixo são componentes definidos uma vez só: a tabela trata cada célula como um
 * componente, e uma função nova a cada troca de etapa faria o React recriar tudo (o contador de
 * pontos e o brilho das setas nasceriam já no estado final).
 */
type TowerMeta = {
  pulseKey: string | number;
  reduced: boolean;
  bestByEvent: Record<number, number>;
  onOpenDriver: (slug: string) => void;
  onHoverDriver: (slug: string) => void;
};
type Cell = CellContext<StandingRow, unknown>;
const metaOf = (ctx: Cell) => ctx.table.options.meta as TowerMeta;

function PositionCell(ctx: Cell) {
  const { pulseKey, reduced } = metaOf(ctx);
  const r = ctx.row.original;
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className={clsx(
          "h-9 w-[3px] origin-center transition-all duration-300",
          r.position === 1
            ? "bg-red shadow-[0_0_10px_var(--red-glow)]"
            : "scale-y-0 bg-red/60 group-hover/row:scale-y-100",
        )}
      />
      <span className="flex flex-col items-center leading-none">
        <span className="display text-2xl font-extrabold">{r.position}</span>
        <span className="num mt-0.5 text-[10px]">
          {/* A chave muda junto com a etapa escolhida: isso redispara o brilho. */}
          <Delta
            key={`${pulseKey}-${r.driver.id}`}
            value={r.delta}
            delay={reduced ? 0 : Math.min(ctx.row.index, 10) * 0.035}
            reduced={reduced}
          />
        </span>
      </span>
    </span>
  );
}

function DriverCell(ctx: Cell) {
  const { onOpenDriver, onHoverDriver } = metaOf(ctx);
  const d = ctx.row.original.driver;
  const races = ctx.row.original.races;
  return (
    <button
      type="button"
      disabled={d.hidden}
      onClick={() => onOpenDriver(d.slug)}
      onPointerEnter={() => onHoverDriver(d.slug)}
      onFocus={() => onHoverDriver(d.slug)}
      className="group flex w-full items-center gap-3 py-1 text-left font-sans disabled:cursor-default"
    >
      <DriverAvatar name={d.name} photo={d.photo} size={34} eager={ctx.row.index < 8} />
      <span className="min-w-0">
        <span className="block truncate font-semibold leading-tight transition-colors group-hover:text-red group-disabled:group-hover:text-text sm:text-[1.05rem]">
          {d.name}
        </span>
        <span className="eyebrow block !text-[10px] !tracking-[0.1em]">
          {races} {races === 1 ? "corrida" : "corridas"}
        </span>
      </span>
    </button>
  );
}

function PointsCell(ctx: Cell) {
  return <Ticker value={ctx.getValue() as number} className="text-base font-bold sm:text-lg" />;
}

function GapCell(ctx: Cell) {
  const r = ctx.row.original;
  return r.position === 1 ? (
    <span className="text-[10px] tracking-[0.14em] text-red">LÍDER</span>
  ) : (
    <span className="text-muted">−{formatPoints(r.gap_to_leader)}</span>
  );
}

function CountCell(ctx: Cell) {
  const value = ctx.getValue() as number;
  return <span className={clsx(!value && "text-faint")}>{value}</span>;
}

function EventCell(ctx: Cell) {
  const number = Number(ctx.column.id.slice(1)); // colunas "e1", "e2"…
  const value = ctx.row.original.per_event[String(number)];
  if (value === null || value === undefined) return <span className="text-faint">·</span>;
  const best = value > 0 && value === metaOf(ctx).bestByEvent[number];
  return (
    <span
      className={clsx(value === 0 && "text-faint", best && "font-bold text-red")}
      title={best ? "Maior pontuação da etapa" : undefined}
    >
      {formatPoints(value)}
    </span>
  );
}

export function TimingTower({
  rows,
  events,
  search,
  selectedSlug,
  pulseKey,
  onOpenDriver,
  onHoverDriver,
}: {
  rows: StandingRow[];
  events: EventInfo[];
  search: string;
  /** Muda quando a etapa selecionada muda: dispara o brilho nas setas de variação. */
  pulseKey: string | number;
  selectedSlug: string | null;
  onOpenDriver: (slug: string) => void;
  onHoverDriver: (slug: string) => void;
}) {
  const reduced = useReducedMotion();
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<StandingRow>[]>(
    () => [
      {
        id: "position",
        header: "Pos",
        accessorKey: "position",
        meta: { className: "sticky left-0 z-10 w-14 min-w-14 max-w-14 pl-0", sticky: true },
        cell: PositionCell,
      },
      {
        id: "driver",
        header: "Piloto",
        accessorFn: (row) => row.driver.name,
        meta: { className: "sticky left-14 z-10 min-w-[11.5rem] sm:min-w-[16rem]", sticky: true },
        cell: DriverCell,
      },
      {
        id: "points",
        header: "Pts",
        accessorKey: "points",
        sortDescFirst: true,
        meta: { className: "w-16 text-right" },
        cell: PointsCell,
      },
      {
        id: "gap",
        header: "Dif",
        accessorKey: "gap_to_leader",
        meta: { className: "w-16 text-right" },
        cell: GapCell,
      },
      {
        id: "wins",
        header: "Vit",
        accessorKey: "wins",
        sortDescFirst: true,
        meta: { className: "w-11 text-right" },
        cell: CountCell,
      },
      {
        id: "podiums",
        header: "Pód",
        accessorKey: "podiums",
        sortDescFirst: true,
        meta: { className: "w-11 text-right pr-4" },
        cell: CountCell,
      },
      ...events.map<ColumnDef<StandingRow>>((event) => ({
        id: `e${event.number}`,
        header: () => (
          <span
            className="flex flex-col items-end leading-none"
            title={`${event.location} · ${formatDate(event.date)}`}
          >
            <span>{event.label}</span>
            {event.preseason && <span className="mt-1 text-[9px] tracking-normal text-faint">PRÉ</span>}
          </span>
        ),
        accessorFn: (row) => row.per_event[String(event.number)] ?? -1,
        sortDescFirst: true,
        cell: EventCell,
        meta: { className: "w-12 text-right" },
      })),
    ],
    [events],
  );

  // Maior pontuação de cada etapa na tabela (apresentação: só destaca o maior número da coluna).
  const bestByEvent = useMemo(() => {
    const best: Record<number, number> = {};
    for (const event of events) {
      best[event.number] = Math.max(0, ...rows.map((r) => r.per_event[String(event.number)] ?? 0));
    }
    return best;
  }, [events, rows]);

  // eslint-disable-next-line react-hooks/incompatible-library -- componente não usa React Compiler
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    globalFilterFn: (row, _id, value: string) =>
      row.original.driver.name
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .includes(
          value
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .toLowerCase()
            .trim(),
        ),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => String(row.driver.id),
    meta: { pulseKey, reduced, bestByEvent, onOpenDriver, onHoverDriver } satisfies TowerMeta,
  });

  const visible = table.getRowModel().rows;

  return (
    <div className="panel cut relative">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="num w-full border-collapse text-sm">
          <caption className="sr-only">Classificação geral, sem descarte</caption>
          <thead>
            <tr className="border-b border-line-strong">
              {table.getHeaderGroups()[0].headers.map((header) => {
                const meta = header.column.columnDef.meta as
                  { className?: string; sticky?: boolean } | undefined;
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    className={clsx(
                      "eyebrow h-11 px-2 text-left align-middle font-normal",
                      meta?.sticky && "bg-surface",
                      meta?.className,
                    )}
                  >
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={clsx(
                        "inline-flex items-center gap-1 hover:text-text",
                        sorted && "text-text",
                      )}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sorted && <span className="text-red">{sorted === "asc" ? "↑" : "↓"}</span>}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {visible.map((row, index) => {
                const selected = row.original.driver.slug === selectedSlug;
                return (
                  <motion.tr
                    key={row.id}
                    layout={reduced ? false : "position"}
                    // As primeiras linhas já nascem visíveis e só deslizam (não atrasam a primeira
                    // pintura); as de baixo entram quando chegam à tela.
                    initial={reduced ? false : index < 8 ? { x: -16 } : { opacity: 0, x: -16 }}
                    {...(index < 8
                      ? { animate: { x: 0, opacity: 1 } }
                      : { whileInView: { x: 0, opacity: 1 }, viewport: { once: true, amount: 0.6 } })}
                    exit={reduced ? undefined : { opacity: 0 }}
                    whileHover={reduced ? undefined : { x: 3 }}
                    whileTap={reduced ? undefined : { scale: 0.995 }}
                    transition={{
                      // Reordenação (ao trocar a etapa) com mola; entrada com curva suave.
                      layout: { type: "spring", stiffness: 260, damping: 30 },
                      duration: 0.4,
                      delay: reduced ? 0 : Math.min(index, 10) * 0.035,
                      ease: [0.2, 0.7, 0.2, 1],
                    }}
                    className={clsx(
                      "group/row border-b border-line transition-colors last:border-b-0 hover:bg-red-soft",
                      selected && "bg-red-soft",
                    )}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as
                        { className?: string; sticky?: boolean } | undefined;
                      return (
                        <td
                          key={cell.id}
                          className={clsx(
                            "h-[3.25rem] px-2 align-middle whitespace-nowrap",
                            meta?.sticky && "bg-surface transition-colors group-hover/row:bg-[#1c1216]",
                            meta?.sticky && selected && "!bg-[#1c1216]",
                            meta?.className,
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
      {visible.length === 0 && (
        <p className="px-4 py-10 text-center text-muted">Nenhum piloto encontrado com “{search}”.</p>
      )}
    </div>
  );
}
