"use client";

import { useEffect, useMemo, useState } from "react";

import { Field, Notice, PageTitle, inputClass } from "@/components/admin/ui";
import { CATEGORIES } from "@/lib/categories";
import { fetchJSON } from "@/lib/client";
import { formatDate } from "@/lib/format";

type PodiumInfo = {
  event: { number: number };
  race: { label: string };
  events: { number: number; date: string | null; location: string; preseason: boolean; races: string[] }[];
  rows: { position: number; driver: { name: string; photo_art: string | null } }[];
};

const FORMATS = {
  feed: { label: "Feed (1080×1350)", ratio: "4 / 5" },
  story: { label: "Stories (1080×1920)", ratio: "9 / 16" },
} as const;

export default function ArtsPage() {
  const [category, setCategory] = useState<string>("RK1");
  const [event, setEvent] = useState<number | null>(null);
  const [race, setRace] = useState<string | null>(null);
  const [format, setFormat] = useState<keyof typeof FORMATS>("feed");
  const [info, setInfo] = useState<PodiumInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(() => Date.now());

  useEffect(() => {
    const query = new URLSearchParams({ category });
    if (event) query.set("event", String(event));
    if (race) query.set("race", race);
    fetchJSON<PodiumInfo>(`/api/podium?${query}`)
      .then((data) => {
        setInfo(data);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [category, event, race]);

  const selected = info?.events.find((e) => e.number === info.event.number);
  const artQuery = useMemo(() => {
    if (!info) return null;
    const query = new URLSearchParams({
      categoria: category.toLowerCase(),
      etapa: String(info.event.number),
    });
    if (selected?.preseason) query.set("bateria", info.race.label);
    if (format === "story") query.set("formato", "story");
    return query;
  }, [info, selected, category, format]);

  const previewUrl = artQuery ? `/arte/podio?${artQuery}&v=${nonce}` : null;
  const downloadUrl = artQuery ? `/arte/podio?${artQuery}&download=1` : null;
  const missingPhotos = info?.rows.slice(0, 3).filter((r) => !r.driver.photo_art) ?? [];

  return (
    <div className="max-w-6xl">
      <PageTitle title="Artes para redes sociais" />
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <Field label="Categoria">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setRace(null);
              }}
              className={inputClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Etapa">
            <select
              value={info?.event.number ?? ""}
              onChange={(e) => {
                setEvent(Number(e.target.value));
                setRace(null);
                setLoaded(false);
              }}
              className={inputClass}
            >
              {info?.events.map((e) => (
                <option key={e.number} value={e.number}>
                  Etapa {e.number} · {e.location} · {formatDate(e.date)}
                  {e.preseason ? " (pré-temporada)" : ""}
                </option>
              ))}
            </select>
          </Field>
          {selected?.preseason && (
            <Field label="Bateria" hint="Na pré-temporada, cada bateria tem seu pódio.">
              <select
                value={info?.race.label}
                onChange={(e) => {
                  setRace(e.target.value);
                  setLoaded(false);
                }}
                className={inputClass}
              >
                {selected.races.map((label) => (
                  <option key={label}>{label}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Formato">
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value as keyof typeof FORMATS);
                setLoaded(false);
              }}
              className={inputClass}
            >
              {Object.entries(FORMATS).map(([key, value]) => (
                <option key={key} value={key}>
                  {value.label}
                </option>
              ))}
            </select>
          </Field>

          {missingPhotos.length > 0 && (
            <Notice>
              Sem foto: {missingPhotos.map((r) => r.driver.name).join(", ")}. A arte mostra as iniciais; envie
              as fotos em Pilotos para um resultado melhor.
            </Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}

          <div className="flex flex-wrap gap-2">
            {downloadUrl && (
              <a
                href={downloadUrl}
                download
                className="cut-sm inline-flex items-center justify-center bg-red px-4 py-2 text-sm font-semibold text-white hover:bg-[#ff1a27]"
              >
                Baixar PNG
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                setNonce(Date.now());
                setLoaded(false);
              }}
              className="cut-sm border border-line-strong px-4 py-2 text-sm font-semibold hover:border-red"
            >
              Atualizar prévia
            </button>
          </div>
          <p className="text-xs text-muted">
            A arte usa os resultados e as fotos já cadastrados. Depois de importar uma etapa ou trocar uma
            foto, clique em Atualizar prévia.
          </p>
        </div>

        <div className="flex justify-center">
          {previewUrl && (
            <div
              className="relative w-full max-w-[460px] border border-line bg-surface"
              style={{ aspectRatio: FORMATS[format].ratio }}
            >
              {!loaded && (
                <span className="eyebrow absolute inset-0 flex items-center justify-center">
                  Gerando arte…
                </span>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={previewUrl}
                src={previewUrl}
                alt={`Arte do pódio ${category}, etapa ${info?.event.number}`}
                onLoad={() => setLoaded(true)}
                className="relative h-full w-full object-contain"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
