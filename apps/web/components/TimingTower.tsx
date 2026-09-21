"use client";

import {
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
import { useMemo, useState } from "react";

import { formatDate, formatPoints } from "@/lib/format";
import { useReducedMotion } from "@/lib/motion";
import type { EventInfo, StandingRow } from "@/lib/types";

import { DriverAvatar } from "./DriverAvatar";

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-faint">·</span>;
  if (value === 0) return <span className="text-faint">–</span>;
  const up = value > 0;
  return (
    <span className={clsx("inline-flex items-center gap-0.5", up ? "text-up" : "text-red")}>
      <svg viewBox="0 0 8 8" className={clsx("h-2 w-2", !up && "rotate-180")} aria-hidden>
        <path d="M4 1 7.5 7H.5Z" fill="currentColor" />
      </svg>
      {Math.abs(value)}
      <span className="sr-only">{up ? " posições acima" : " posições abaixo"}</span>
    </span>
  );
}

export function TimingTower({
  rows,
  events,
  search,
  selectedSlug,
  onOpenDriver,
  onHoverDriver,
}: {
  rows: StandingRow[];
  events: EventInfo[];
  search: string;
  selectedSlug: string | null;
  onOpenDriver: (slug: string) => void;
  onHoverDriver: (slug: string) => void;
}) {
  const reduced = useReducedMotion();
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<StandingRow>[]>(() => {
    const eventColumns: ColumnDef<StandingRow>[] = events.map((event) => ({
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
      cell: ({ row }) => {
        const value = row.original.per_event[String(event.number)];
        if (value === null || value === undefined) return <span className="text-faint">·</span>;
        return <span className={clsx(value === 0 && "text-faint")}>{formatPoints(value)}</span>;
      },
      meta: { className: "w-12 text-right" },
    }));
    return [
      {
        id: "position",
        header: "Pos",
        accessorKey: "position",
        meta: { className: "sticky left-0 z-10 w-14 min-w-14 max-w-14 pl-0", sticky: true },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className={clsx(
                  "h-9 w-[3px]",
                  r.position === 1 ? "bg-red shadow-[0_0_10px_var(--red-glow)]" : "bg-transparent",
                )}
              />
              <span className="flex flex-col items-center leading-none">
                <span className="display text-2xl font-extrabold">{r.position}</span>
                <span className="num mt-0.5 text-[10px]">
                  <Delta value={r.delta} />
                </span>
              </span>
            </span>
          );
        },
      },
      {
        id: "driver",
        header: "Piloto",
        accessorFn: (row) => row.driver.name,
        meta: { className: "sticky left-14 z-10 min-w-[11.5rem] sm:min-w-[16rem]", sticky: true },
        cell: ({ row }) => {
          const d = row.original.driver;
          return (
            <button
              type="button"
              disabled={d.hidden}
              onClick={() => onOpenDriver(d.slug)}
              onPointerEnter={() => onHoverDriver(d.slug)}
              onFocus={() => onHoverDriver(d.slug)}
              className="group flex w-full items-center gap-3 py-1 text-left font-sans disabled:cursor-default"
            >
              <DriverAvatar name={d.name} photo={d.photo} size={34} />
              <span className="min-w-0">
                <span className="block truncate font-semibold leading-tight transition-colors group-hover:text-red group-disabled:group-hover:text-text sm:text-[1.05rem]">
                  {d.name}
                </span>
                <span className="eyebrow block !text-[10px] !tracking-[0.1em]">
                  {row.original.races} {row.original.races === 1 ? "corrida" : "corridas"}
                </span>
              </span>
            </button>
          );
        },
      },
      {
        id: "points",
        header: "Pts",
        accessorKey: "points",
        sortDescFirst: true,
        meta: { className: "w-16 text-right" },
        cell: ({ getValue }) => (
          <span className="text-base font-bold sm:text-lg">{formatPoints(getValue<number>())}</span>
        ),
      },
      {
        id: "gap",
        header: "Dif",
        accessorKey: "gap_to_leader",
        meta: { className: "w-16 text-right" },
        cell: ({ row }) =>
          row.original.position === 1 ? (
            <span className="text-[10px] tracking-[0.14em] text-red">LÍDER</span>
          ) : (
            <span className="text-muted">−{formatPoints(row.original.gap_to_leader)}</span>
          ),
      },
      {
        id: "wins",
        header: "Vit",
        accessorKey: "wins",
        sortDescFirst: true,
        meta: { className: "w-11 text-right" },
        cell: ({ getValue }) => (
          <span className={clsx(!getValue<number>() && "text-faint")}>{getValue<number>()}</span>
        ),
      },
      {
        id: "podiums",
        header: "Pód",
        accessorKey: "podiums",
        sortDescFirst: true,
        meta: { className: "w-11 text-right pr-4" },
        cell: ({ getValue }) => (
          <span className={clsx(!getValue<number>() && "text-faint")}>{getValue<number>()}</span>
        ),
      },
      ...eventColumns,
    ];
  }, [events, onOpenDriver, onHoverDriver]);

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
                    initial={reduced ? false : { opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduced ? undefined : { opacity: 0 }}
                    transition={{
                      duration: 0.35,
                      delay: reduced ? 0 : Math.min(index, 20) * 0.018,
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
