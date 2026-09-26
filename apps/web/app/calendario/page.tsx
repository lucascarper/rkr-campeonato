import clsx from "clsx";
import type { Metadata } from "next";
import Link from "next/link";

import { ApiUnavailable } from "@/components/ApiUnavailable";
import { Reveal } from "@/components/Reveal";
import { getCalendar } from "@/lib/api";
import type { CalendarEvent } from "@/lib/types";

// Montada a cada acesso (os dados continuam em cache): no build a api ainda não está acessível,
// e uma página estática gerada ali ficaria presa em "indisponível".
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Calendário",
  description: "Etapas do campeonato RKR: datas, kartódromos, vencedores e próximas corridas.",
};

const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" });
const dayMonth = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: "America/Sao_Paulo",
});

function parts(iso: string | null) {
  if (!iso) return { day: "A definir", week: "" };
  const date = new Date(`${iso}T12:00:00-03:00`);
  return { day: dayMonth.format(date).replace(".", "").replace(" de ", " "), week: weekday.format(date) };
}

export default async function CalendarPage() {
  const calendar = await getCalendar();
  if (!calendar) return <ApiUnavailable />;
  const next = calendar.events.find((e) => e.status === "scheduled");

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-4 sm:pt-10">
      <h1 className="display text-4xl font-extrabold sm:text-7xl">
        Calendário <span className="text-red">{calendar.season}</span>
      </h1>
      <p className="mt-2 text-sm text-muted">
        {calendar.events.filter((e) => e.status === "done").length} de {calendar.events.length} etapas
        realizadas.
      </p>

      <ol className="relative mt-8 border-l border-line-strong pl-5 sm:pl-8">
        {calendar.events.map((event, i) => (
          <Reveal
            as="li"
            key={event.number}
            delay={Math.min(i, 6) * 0.04}
            className="relative pb-6 last:pb-0"
          >
            <EventRow event={event} isNext={event.number === next?.number} />
          </Reveal>
        ))}
      </ol>
    </div>
  );
}

function EventRow({ event, isNext }: { event: CalendarEvent; isNext: boolean }) {
  const done = event.status === "done";
  const { day, week } = parts(event.date);
  const winners = event.races.filter((r) => r.winner);
  return (
    <>
      {/* Marcador na linha do tempo */}
      <span
        aria-hidden
        className={clsx(
          "absolute -left-[26px] top-5 h-3 w-3 rotate-45 border sm:-left-[38px]",
          isNext
            ? "border-red bg-red shadow-[0_0_14px_var(--red-glow)]"
            : done
              ? "border-white/60 bg-white/60"
              : "border-line-strong bg-bg",
        )}
      />
      <div
        className={clsx(
          "cut grid gap-3 border p-4 sm:grid-cols-[5.5rem_1fr_auto] sm:items-center sm:gap-5 sm:p-5",
          isNext ? "border-red bg-red-soft" : "border-line bg-surface",
          event.status === "cancelled" && "opacity-50",
        )}
      >
        <span className="display text-4xl font-extrabold leading-none sm:text-5xl">
          <span className={clsx(isNext && "text-red")}>E{event.number}</span>
          {event.preseason && (
            <span className="num ml-2 align-top text-[10px] not-italic tracking-widest text-faint">PRÉ</span>
          )}
        </span>
        <div className="min-w-0">
          <p className="display text-2xl font-bold leading-tight">{event.location || "Local a definir"}</p>
          <p className="num mt-0.5 text-xs text-muted">
            <span className="capitalize">{week}</span>
            {week && " · "}
            {day}
          </p>
          {winners.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {winners.map((race) => (
                <li key={`${race.label}-${race.category}`} className="flex items-baseline gap-1.5">
                  <span className="num text-[10px] tracking-widest text-red">
                    {race.category ?? race.label.replace("Bateria ", "BAT. ")}
                  </span>
                  <span>{race.winner!.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center gap-3 sm:flex-col sm:items-end">
          <span
            className={clsx(
              "num border px-2 py-0.5 text-[10px] uppercase tracking-widest",
              isNext
                ? "border-red text-red"
                : done
                  ? "border-line-strong text-muted"
                  : event.status === "cancelled"
                    ? "border-line text-faint"
                    : "border-line text-faint",
            )}
          >
            {isNext
              ? "Próxima"
              : done
                ? "Realizada"
                : event.status === "cancelled"
                  ? "Cancelada"
                  : "Agendada"}
          </span>
          {done && (
            <Link
              href={`/rk1?etapa=${event.number}`}
              className="text-xs text-muted transition-colors hover:text-red"
            >
              Classificação após a etapa →
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
