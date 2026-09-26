"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadDriver } from "@/lib/client";
import { formatDate, formatDecimal, formatPoints, initials, shortName, statusLabel } from "@/lib/format";
import type { DriverProfile, DriverRace } from "@/lib/types";

import { CountUp } from "./CountUp";
import { type ChartMode, DriverChart } from "./DriverChart";

type Neighbor = { slug: string; name: string } | null;
type Direction = "prev" | "next" | null;

/**
 * Janela do piloto: vidro semitransparente sobre a lista, com foto que se dissolve no painel,
 * posição gigante em marca d'água, estatísticas e gráfico (pontos ou posição, com comparação).
 */
export function DriverModal({
  slug,
  category,
  upto,
  previous,
  next,
  drivers = [],
  onClose,
  onNavigate,
}: {
  slug: string | null;
  category: string;
  upto: number | null;
  previous: Neighbor;
  next: Neighbor;
  /** Pilotos da categoria, para escolher com quem comparar. */
  drivers?: { slug: string; name: string }[];
  onClose: () => void;
  onNavigate: (slug: string) => void;
}) {
  const [result, setResult] = useState<{ key: string; profile?: DriverProfile; error?: string } | null>(null);
  const [withDiscard, setWithDiscard] = useState(false);
  const [mode, setMode] = useState<ChartMode>("points");
  const [compareSlug, setCompareSlug] = useState<string | null>(null);
  const [compare, setCompare] = useState<{ key: string; profile: DriverProfile } | null>(null);
  // De que lado veio a troca de piloto (anima a entrada do conteúdo); nulo ao abrir pela tabela.
  const [direction, setDirection] = useState<Direction>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
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

  const compareKey = `${compareSlug}|${category}|${upto}`;
  useEffect(() => {
    if (!compareSlug) return;
    let active = true;
    loadDriver(compareSlug, category, upto)
      .then((profile) => active && setCompare({ key: compareKey, profile }))
      .catch(() => active && setCompareSlug(null));
    return () => {
      active = false;
    };
  }, [compareSlug, category, upto, compareKey]);

  const profile = result?.key === key ? result.profile : undefined;
  const error = result?.key === key ? result.error : undefined;
  const compareProfile =
    compareSlug && compareSlug !== slug && compare?.key === compareKey ? compare.profile : null;

  const go = useCallback(
    (target: Neighbor, dir: Direction) => {
      if (!target) return;
      setDirection(dir);
      onNavigate(target.slug);
    },
    [onNavigate],
  );

  useEffect(() => {
    if (!slug) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[role=radiogroup], select")) return; // setas dos seletores do gráfico
      if (event.key === "ArrowLeft") go(previous, "prev");
      if (event.key === "ArrowRight") go(next, "next");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slug, previous, next, go]);

  // Deslizar para o lado (celular) troca de piloto. O gráfico fica de fora, porque usa o toque.
  const onTouchStart = (event: React.TouchEvent) => {
    const target = event.target as HTMLElement;
    touch.current = target.closest("[data-no-swipe]")
      ? null
      : { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) go(next, "next");
    else go(previous, "prev");
  };

  return (
    <Dialog.Root
      open={Boolean(slug)}
      onOpenChange={(open) => {
        if (open) return;
        setDirection(null);
        onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay fixed inset-0 z-50 bg-black/40 backdrop-blur-[3px]" />
        <Dialog.Content
          aria-describedby={undefined}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className={clsx(
            "sheet glass fixed z-50 flex flex-col overflow-hidden text-text outline-none",
            "inset-x-0 bottom-0 max-h-[92dvh]",
            "md:inset-auto md:left-1/2 md:top-1/2 md:h-[min(88dvh,780px)] md:w-[min(1080px,94vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:cut",
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 bg-line-strong md:hidden" aria-hidden />
          <div className="absolute right-2 top-2 z-20 flex items-center gap-1 md:right-3 md:top-3">
            {profile && <ShareButton profile={profile} />}
            <NavButton
              label={previous ? `Piloto anterior: ${previous.name}` : undefined}
              onClick={() => go(previous, "prev")}
              dir="prev"
            />
            <NavButton
              label={next ? `Próximo piloto: ${next.name}` : undefined}
              onClick={() => go(next, "next")}
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
            <ProfileBody
              key={profile.driver.slug}
              enterFrom={direction}
              profile={profile}
              withDiscard={withDiscard}
              setWithDiscard={setWithDiscard}
              mode={mode}
              setMode={setMode}
              compare={compareProfile}
              compareSlug={compareSlug}
              setCompareSlug={setCompareSlug}
              drivers={drivers.filter((d) => d.slug !== profile.driver.slug)}
            />
          ) : error ? (
            <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 p-10">
              <Dialog.Title className="sr-only">Piloto indisponível</Dialog.Title>
              <p className="text-muted">Não foi possível carregar o piloto: {error}</p>
            </div>
          ) : (
            <ProfileSkeleton />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Esqueleto no formato da janela enquanto os dados do piloto chegam. */
function ProfileSkeleton() {
  return (
    <div className="grid min-h-[60dvh] flex-1 animate-pulse md:grid-cols-[minmax(260px,340px)_1fr]" aria-busy>
      <Dialog.Title className="sr-only">Carregando piloto</Dialog.Title>
      <div className="h-72 bg-surface-2 sm:h-80 md:h-full" />
      <div className="flex flex-col gap-4 p-4 md:p-6 md:pt-14">
        <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-surface-2" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-10 bg-surface-2/70" />
          ))}
        </div>
        <div className="h-56 bg-surface-2/60 sm:h-64" />
      </div>
    </div>
  );
}

/** Compartilhar o link do piloto: menu nativo do celular (WhatsApp etc.) ou copiar o link. */
function ShareButton({ profile }: { profile: DriverProfile }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    const title = `${profile.driver.name} · RKR Kart Racing`;
    const text = profile.rank
      ? `${profile.driver.name}: ${profile.rank}º na ${profile.category} com ${formatPoints(profile.stats.points)} pontos`
      : title;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        /* compartilhamento cancelado */
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={share}
      className="flex h-9 items-center border border-line-strong bg-bg/60 px-3 text-xs font-semibold text-muted transition-colors hover:border-red hover:text-text"
    >
      <span aria-live="polite">{copied ? "Link copiado" : "Compartilhar"}</span>
    </button>
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
  mode,
  setMode,
  compare,
  compareSlug,
  setCompareSlug,
  drivers,
  enterFrom,
}: {
  profile: DriverProfile;
  withDiscard: boolean;
  setWithDiscard: (value: boolean) => void;
  mode: ChartMode;
  setMode: (mode: ChartMode) => void;
  compare: DriverProfile | null;
  compareSlug: string | null;
  setCompareSlug: (slug: string | null) => void;
  drivers: { slug: string; name: string }[];
  enterFrom: Direction;
}) {
  const { driver, stats } = profile;
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const shownPoints = withDiscard ? stats.points_with_discard : stats.points;
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Ao trocar de piloto (setas, teclado ou deslizar), o conteúdo entra pelo lado de onde veio.
    if (!enterFrom || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.current?.animate(
      [
        { transform: `translateX(${enterFrom === "next" ? 28 : -28}px)`, opacity: 0.35 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 320, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
    );
  }, [enterFrom]);

  return (
    <div
      ref={root}
      className="scrollbar-thin min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[minmax(260px,340px)_1fr] md:overflow-hidden"
    >
      {/* Foto + identidade (fixa no desktop; só a coluna de dados rola) */}
      <div className="relative h-72 shrink-0 overflow-hidden sm:h-80 md:h-full">
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
          <Dialog.Title className="display mt-1 text-[2.6rem] font-extrabold leading-[0.95] md:text-5xl">
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
          <ToggleGroup.Root
            type="single"
            value={mode}
            onValueChange={(value) => value && setMode(value as ChartMode)}
            aria-label="O que o gráfico mostra"
            className="flex gap-4"
          >
            {[
              { value: "points", label: "Pontuação acumulada" },
              { value: "position", label: "Posição" },
            ].map((item) => (
              <ToggleGroup.Item
                key={item.value}
                value={item.value}
                className="display border-b-2 border-transparent pb-0.5 text-xl font-bold text-muted transition-colors data-[state=on]:border-red data-[state=on]:text-text hover:text-text"
              >
                {item.label}
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>
          {mode === "points" && (
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
          )}
        </div>
        {drivers.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <label className="flex items-center gap-2">
              <span className="eyebrow">Comparar com</span>
              <select
                value={compareSlug ?? ""}
                onChange={(e) => setCompareSlug(e.target.value || null)}
                className="cut-sm border border-line-strong bg-surface px-2 py-1.5 text-xs outline-none focus:border-red"
              >
                <option value="">Ninguém</option>
                {drivers.map((d) => (
                  <option key={d.slug} value={d.slug}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            {compare && (
              <span className="flex items-center gap-3 text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-[3px] w-4 bg-red" aria-hidden />
                  {shortName(driver.name)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-[2px] w-4 bg-white/75" aria-hidden />
                  {shortName(compare.driver.name)}
                </span>
              </span>
            )}
          </div>
        )}
        <div className="mt-2" data-no-swipe>
          <DriverChart profile={profile} withDiscard={withDiscard} mode={mode} compare={compare} />
        </div>

        {/* Etapas */}
        <h3 className="display mt-4 text-xl font-bold">Corridas</h3>
        <ol className="mt-2 divide-y divide-line border-y border-line">
          {[
            ...profile.races.map((race) => ({ event: race.event, order: 0, race, absence: null })),
            ...(profile.absences ?? []).map((absence) => ({
              event: absence.event,
              order: 1,
              race: null,
              absence,
            })),
          ]
            .sort((a, b) => a.event - b.event || a.order - b.order)
            .map((item) =>
              item.race ? (
                <RaceLine
                  key={item.race.result_id}
                  race={item.race}
                  faded={withDiscard && item.race.discarded}
                />
              ) : (
                <AbsenceLine
                  key={item.absence!.id}
                  absence={item.absence!}
                  faded={withDiscard && item.absence!.discarded}
                />
              ),
            )}
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

function AbsenceLine({ absence, faded }: { absence: DriverProfile["absences"][number]; faded: boolean }) {
  return (
    <li
      className={clsx(
        "grid grid-cols-[3rem_1fr_auto] items-center gap-3 py-2.5 transition-opacity",
        faded && "opacity-35",
      )}
    >
      <span className="num text-xs text-muted">
        E{absence.event}
        {absence.preseason && <span className="block text-[9px] text-faint">PRÉ</span>}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm text-muted">Não correu · {absence.location}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {formatDate(absence.date)}
          <Badge>Falta</Badge>
          {faded && <Badge>Descartada</Badge>}
        </span>
      </span>
      <span className="num text-right">
        <span className="block text-base font-bold text-faint">—</span>
        <span className="text-xs text-muted">0 pts</span>
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
