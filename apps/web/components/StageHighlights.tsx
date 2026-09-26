"use client";

import clsx from "clsx";

import { formatDate, formatPoints, initials } from "@/lib/format";
import type { DriverRef, Highlights } from "@/lib/types";

type Card = {
  label: string;
  tone?: "fastest";
  drivers: DriverRef[];
  detail: string;
};

/** Destaques da última etapa do intervalo: vencedor, pole, volta mais rápida e maior subida. */
export function StageHighlights({
  highlights,
  drivers,
  onOpen,
}: {
  highlights: Highlights;
  drivers: Record<string, DriverRef>;
  onOpen: (slug: string) => void;
}) {
  const refs = (ids: number[]) => ids.map((id) => drivers[String(id)]).filter(Boolean);
  const heats = (list: { race: string }[]) => (list.length > 1 ? `${list.length} baterias` : "");
  const rise = highlights.biggest_rise;
  const cards: Card[] = [
    {
      label: "Vencedor",
      drivers: refs(highlights.winners.map((w) => w.driver_id)),
      detail:
        heats(highlights.winners) ||
        (highlights.winners[0] ? `${formatPoints(highlights.winners[0].points)} pts na etapa` : ""),
    },
    {
      label: "Pole position",
      drivers: refs(highlights.poles.map((p) => p.driver_id)),
      detail: heats(highlights.poles) || "Largou na frente",
    },
    {
      label: "Volta mais rápida",
      tone: "fastest",
      drivers: refs(highlights.fastest_laps.map((f) => f.driver_id)),
      detail: heats(highlights.fastest_laps) || "Melhor volta da corrida",
    },
    {
      label: "Maior subida",
      drivers: rise ? refs([rise.driver_id]) : [],
      detail: rise ? `${rise.from}º → ${rise.to}º (+${rise.value})` : "",
    },
  ];
  const event = highlights.event;

  return (
    // Fica acima da dobra: sem animação de entrada, para aparecer na primeira pintura.
    <section className="mb-8" aria-label="Destaques da etapa">
      <h2 className="display text-2xl font-extrabold">
        Destaques da etapa <span className="text-red">{event.number}</span>
        {event.location && (
          <span className="num ml-3 align-middle text-xs font-normal not-italic normal-case text-muted">
            {event.location} · {formatDate(event.date ?? null)}
          </span>
        )}
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
        {cards.map((card) => {
          const lead = card.drivers[0];
          const photo = lead?.photo_lg ?? lead?.photo ?? null;
          return (
            <div key={card.label} className="flex min-h-[7.5rem] items-stretch bg-surface">
              <span className="relative w-16 shrink-0 overflow-hidden bg-surface-2 sm:w-24">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" aria-hidden className="h-full w-full object-cover object-top" />
                ) : (
                  <span className="display flex h-full items-center justify-center text-2xl font-extrabold text-white/15">
                    {lead ? initials(lead.name) : "–"}
                  </span>
                )}
                <span
                  aria-hidden
                  className={clsx(
                    "absolute inset-y-0 right-0 w-[3px]",
                    card.tone === "fastest" ? "bg-fastest" : "bg-red",
                  )}
                />
              </span>
              <span className="flex min-w-0 flex-col justify-center gap-1 px-3 py-3">
                <span className={clsx("eyebrow !text-[10px]", card.tone === "fastest" && "!text-fastest")}>
                  {card.label}
                </span>
                {card.drivers.length ? (
                  card.drivers.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      disabled={d.hidden}
                      onClick={() => onOpen(d.slug)}
                      className="display truncate text-left text-base font-bold leading-tight transition-colors hover:text-red sm:text-lg"
                    >
                      {d.name}
                    </button>
                  ))
                ) : (
                  <span className="text-sm text-muted">Sem registro</span>
                )}
                {card.detail && <span className="num text-[11px] text-muted">{card.detail}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
