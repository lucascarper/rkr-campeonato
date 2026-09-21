"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import clsx from "clsx";
import { useEffect, useState } from "react";

import { loadDriver } from "@/lib/client";
import { formatDate, formatDecimal, formatPoints, initials, statusLabel } from "@/lib/format";
import type { DriverProfile, DriverRace } from "@/lib/types";

import { CountUp } from "./CountUp";
import { DriverChart } from "./DriverChart";

type Neighbor = { slug: string; name: string } | null;

/**
 * Janela do piloto: vidro semitransparente sobre a lista, com foto que se dissolve no painel,
 * posição gigante em marca d'água, estatísticas e gráfico com/sem descarte.
 */
export function DriverModal({
  slug,
  category,
  upto,
  previous,
  next,
  onClose,
  onNavigate,
}: {
  slug: string | null;
  category: string;
  upto: number | null;
  previous: Neighbor;
  next: Neighbor;
  onClose: () => void;
  onNavigate: (slug: string) => void;
}) {
  const [result, setResult] = useState<{ key: string; profile?: DriverProfile; error?: string } | null>(null);
  const [withDiscard, setWithDiscard] = useState(false);
  const key = `${slug}|${category}|${upto}`;

  useEffect(() => {
    if (!slug) return;
    let active = true;
    loadDriver(slug, category, upto)
      .then((profile) => active && setResult({ key, profile }))
      .catch((error: Error) => active && setResult({ key, error: error.message }));
    return () => {
      active = false;
    };
  }, [slug, category, upto, key]);

  const profile = result?.key === key ? result.profile : undefined;
  const error = result?.key === key ? result.error : undefined;

  useEffect(() => {
    if (!slug) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[role=radiogroup]")) return; // setas do seletor de descarte
      if (event.key === "ArrowLeft" && previous) onNavigate(previous.slug);
      if (event.key === "ArrowRight" && next) onNavigate(next.slug);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slug, previous, next, onNavigate]);

  return (
    <Dialog.Root open={Boolean(slug)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay fixed inset-0 z-50 bg-black/40 backdrop-blur-[3px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className={clsx(
            "sheet glass fixed z-50 flex flex-col overflow-hidden text-text outline-none",
            "inset-x-0 bottom-0 max-h-[92dvh]",
            "md:inset-auto md:left-1/2 md:top-1/2 md:h-[min(88dvh,780px)] md:w-[min(1080px,94vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:cut",
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 bg-line-strong md:hidden" aria-hidden />
          <div className="absolute right-2 top-2 z-20 flex items-center gap-1 md:right-3 md:top-3">
            <NavButton
              label={previous ? `Piloto anterior: ${previous.name}` : undefined}
              onClick={() => previous && onNavigate(previous.slug)}
              dir="prev"
            />
            <NavButton
              label={next ? `Próximo piloto: ${next.name}` : undefined}
              onClick={() => next && onNavigate(next.slug)}
              dir="next"
            />
            <Dialog.Close
              className="ml-1 flex h-9 w-9 items-center justify-center border border-line-strong bg-bg/60 text-muted transition-colors hover:border-red hover:text-text"
              aria-label="Fechar"
            >
              <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden>
                <path d="M1 1l12 12M13 1 1 13" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </Dialog.Close>
          </div>

          {profile ? (
            <ProfileBody profile={profile} withDiscard={withDiscard} setWithDiscard={setWithDiscard} />
          ) : (
            <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 p-10">
              <Dialog.Title className="sr-only">Carregando piloto</Dialog.Title>
              {error ? (
                <p className="text-muted">Não foi possível carregar o piloto: {error}</p>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/brand/r-mark.png"
                    alt=""
                    className="h-12 w-12 animate-pulse object-contain opacity-80"
                  />
                  <span className="eyebrow">Carregando telemetria</span>
                </>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NavButton({ label, onClick, dir }: { label?: string; onClick: () => void; dir: "prev" | "next" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!label}
      aria-label={label ?? (dir === "prev" ? "Sem piloto anterior" : "Sem próximo piloto")}
      title={label}
      className="flex h-9 w-9 items-center justify-center border border-line-strong bg-bg/60 text-muted transition-colors hover:border-red hover:text-text disabled:opacity-30 disabled:hover:border-line-strong"
    >
      <svg viewBox="0 0 10 10" className={clsx("h-3 w-3", dir === "next" && "rotate-180")} aria-hidden>
        <path d="M7 1 3 5l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </button>
  );
}

function ProfileBody({
  profile,
  withDiscard,
  setWithDiscard,
}: {
  profile: DriverProfile;
  withDiscard: boolean;
  setWithDiscard: (value: boolean) => void;
}) {
  const { driver, stats } = profile;
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const shownPoints = withDiscard ? stats.points_with_discard : stats.points;

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[minmax(260px,340px)_1fr] md:overflow-hidden">
      {/* Foto + identidade (fixa no desktop; só a coluna de dados rola) */}
      <div className="relative h-56 shrink-0 overflow-hidden md:h-full">
        {driver.photo && failedPhoto !== driver.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={driver.photo}
            alt={`Foto de ${driver.name}`}
            onError={() => setFailedPhoto(driver.photo)}
            className="photo-fade absolute inset-0 h-full w-full object-cover object-top"
          />
        ) : (
          <div className="photo-fade absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-2 to-bg">
            <span className="display text-8xl font-extrabold text-white/10">{initials(driver.name)}</span>
          </div>
        )}
        <span
          aria-hidden
          className="display outline-text pointer-events-none absolute right-2 z-[1] md:-right-6 bottom-[-0.12em] select-none text-[11rem] font-extrabold leading-none md:text-[16rem]"
        >
          {profile.rank ?? "–"}
        </span>
        {/* vinheta vermelha */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_20%_100%,rgba(225,6,19,0.35),transparent_60%)]"
        />
        <div className="absolute inset-x-0 bottom-0 p-4 md:p-6">
          <span className="eyebrow !text-red">
            {profile.category} · {profile.season}
          </span>
          <Dialog.Title className="display mt-1 text-4xl font-extrabold md:text-5xl">
            {driver.name}
          </Dialog.Title>
          {driver.nickname && <p className="mt-1 text-muted">“{driver.nickname}”</p>}
        </div>
      </div>

      <div className="scrollbar-thin min-w-0 p-4 md:min-h-0 md:overflow-y-auto md:p-6 md:pt-14">
        {/* Cabeçalho numérico */}
        <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          <Metric
            label="Posição"
            value={profile.rank ? `${profile.rank}º` : "—"}
            hint={`de ${profile.total_drivers}`}
            accent
          />
          <Metric
            label={withDiscard ? `Pontos (−${profile.discards})` : "Pontos"}
            value={
              <CountUp
                key={String(withDiscard)}
                value={shownPoints}
                format={(n) => formatPoints(Math.round(n * 10) / 10)}
              />
            }
            hint={stats.gap_to_leader ? `−${formatPoints(stats.gap_to_leader)} do líder` : "líder"}
          />
          <Metric label="Participações" value={String(stats.races)} hint={`até a E${profile.upto ?? "–"}`} />
          <Metric label="Pts/corrida" value={formatDecimal(stats.points_per_race)} />
        </dl>

        {/* Estatísticas */}
        <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3 border-y border-line py-4 sm:grid-cols-4">
          <Stat label="Vitórias" value={stats.wins} />
          <Stat label="Pódios" value={stats.podiums} />
          <Stat label="Poles" value={stats.poles} />
          <Stat label="Voltas rápidas" value={stats.fastest_laps} fastest />
          <Stat label="Melhor posição" value={stats.best_position ? `${stats.best_position}º` : "—"} />
          <Stat label="Posição média" value={formatDecimal(stats.avg_position)} />
          <Stat
            label="Penalizações"
            value={stats.penalties}
            sub={stats.penalty_seconds ? `${formatDecimal(stats.penalty_seconds, 0)} s` : undefined}
          />
          <Stat
            label="Conclusão"
            value={stats.completion_rate === null ? "—" : `${formatDecimal(stats.completion_rate, 0)}%`}
          />
        </dl>

        {/* Gráfico */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <h3 className="display text-xl font-bold">Pontuação acumulada</h3>
          <ToggleGroup.Root
            type="single"
            value={withDiscard ? "with" : "without"}
            onValueChange={(value) => value && setWithDiscard(value === "with")}
            aria-label="Visão da pontuação"
            className="cut-sm flex border border-line-strong p-0.5"
          >
            {[
              { value: "without", label: "Sem descarte" },
              { value: "with", label: `Com descarte (${profile.discards})` },
            ].map((item) => (
              <ToggleGroup.Item
                key={item.value}
                value={item.value}
                className="eyebrow px-3 py-1.5 transition-colors data-[state=on]:bg-red data-[state=on]:!text-white hover:!text-text"
              >
                {item.label}
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>
        </div>
        <div className="mt-2">
          <DriverChart profile={profile} withDiscard={withDiscard} />
        </div>

        {/* Etapas */}
        <h3 className="display mt-4 text-xl font-bold">Corridas</h3>
        <ol className="mt-2 divide-y divide-line border-y border-line">
          {profile.races.map((race) => (
            <RaceLine key={race.result_id} race={race} faded={withDiscard && race.discarded} />
          ))}
        </ol>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-bg/70 p-3">
      <dt className="eyebrow">{label}</dt>
      <dd className={clsx("num mt-1 text-2xl font-bold sm:text-3xl", accent && "text-red")}>{value}</dd>
      {hint && <dd className="text-xs text-muted">{hint}</dd>}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  fastest,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  fastest?: boolean;
}) {
  return (
    <div>
      <dt className="eyebrow !text-[10px]">{label}</dt>
      <dd className={clsx("num text-lg font-bold", fastest && "text-fastest")}>
        {value}
        {sub && <span className="ml-1 text-xs font-normal text-muted">{sub}</span>}
      </dd>
    </div>
  );
}

function RaceLine({ race, faded }: { race: DriverRace; faded: boolean }) {
  const classified = race.status === "FIN" || race.status === "DNF";
  return (
    <li
      className={clsx(
        "grid grid-cols-[3rem_1fr_auto] items-center gap-3 py-2.5 transition-opacity",
        faded && "opacity-35",
      )}
    >
      <span className="num text-xs text-muted">
        E{race.event}
        {race.preseason && <span className="block text-[9px] text-faint">PRÉ</span>}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm">
          {race.label} · {race.location}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {formatDate(race.date)}
          {race.pole && <Badge>Pole</Badge>}
          {race.fastest_lap && <Badge tone="fastest">VR</Badge>}
          {race.penalties.map((p, i) => (
            <Badge key={i} tone="red" title={p.reason}>
              {p.seconds ? `+${p.seconds}s` : p.kind}
            </Badge>
          ))}
          {faded && <Badge>Descartada</Badge>}
        </span>
      </span>
      <span className="num text-right">
        <span className={clsx("block text-base font-bold", race.position === 1 && "text-red")}>
          {classified ? (
            `P${race.position ?? "—"}`
          ) : (
            <span className="text-xs text-red">{statusLabel(race.status)}</span>
          )}
        </span>
        <span className="text-xs text-muted">{formatPoints(race.points)} pts</span>
      </span>
    </li>
  );
}

function Badge({
  children,
  tone,
  title,
}: {
  children: React.ReactNode;
  tone?: "red" | "fastest";
  title?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        "num border px-1 text-[10px] uppercase leading-4 tracking-wider",
        tone === "red" && "border-red/60 text-red",
        tone === "fastest" && "border-fastest/60 text-fastest",
        !tone && "border-line-strong text-muted",
      )}
    >
      {children}
    </span>
  );
}
