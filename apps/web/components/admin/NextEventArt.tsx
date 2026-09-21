"use client";

import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";

import { adminFetch, fetchJSON } from "@/lib/client";

import { Button, Field, Notice, inputClass } from "./ui";

type Schedule = Partial<Record<"practice" | "RK3" | "RK2" | "RK1", string>>;
type Card = {
  id: number;
  event: { number: number; date: string | null; location: string; status: string };
  schedule: Schedule;
  track_direction: "" | "cw" | "ccw";
  track_art: string | null;
  events: { number: number; date: string | null; location: string; status: string }[];
};

const SLOTS = [
  { key: "practice", label: "Treino" },
  { key: "RK3", label: "RK3" },
  { key: "RK2", label: "RK2" },
  { key: "RK1", label: "RK1" },
] as const;

const FORMATS = {
  feed: { label: "Feed (1080×1350)", ratio: "4 / 5" },
  story: { label: "Stories (1080×1920)", ratio: "9 / 16" },
} as const;

type Form = {
  number: string;
  date: string;
  location: string;
  schedule: Schedule;
  track_direction: "" | "cw" | "ccw";
};

/**
 * Arte "Próxima etapa": os dados são digitados aqui (a planilha só chega depois da corrida).
 * Salvar cria a etapa se ela ainda não existir; o traçado é enviado a cada etapa.
 */
export function NextEventArt() {
  const [card, setCard] = useState<Card | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [trackFile, setTrackFile] = useState<File | null>(null);
  const [trackPreview, setTrackPreview] = useState<string | null>(null);
  const [format, setFormat] = useState<keyof typeof FORMATS>("feed");
  const [savedNumber, setSavedNumber] = useState<number | null>(null);
  const [nonce, setNonce] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback((number?: number) => {
    const query = number ? `?event=${number}` : "";
    fetchJSON<Card>(`/api/event-card${query}`)
      .then((data) => {
        setCard(data);
        setForm({
          number: String(data.event.number),
          date: data.event.date ?? "",
          location: data.event.location,
          schedule: data.schedule ?? {},
          track_direction: data.track_direction,
        });
        setSavedNumber(data.event.number);
        setTrackFile(null);
        setTrackPreview(null);
        setLoaded(false);
      })
      .catch((e: Error) => setMessage({ tone: "error", text: e.message }));
  }, []);
  useEffect(() => load(), [load]);

  const chooseTrack = (file: File | null) => {
    if (trackPreview) URL.revokeObjectURL(trackPreview);
    setTrackFile(file);
    setTrackPreview(file ? URL.createObjectURL(file) : null);
  };

  if (!form || !card) return <p className="text-muted">{message?.text ?? "Carregando…"}</p>;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm({ ...form, [key]: value });
  const nextNumber = Math.max(0, ...card.events.map((e) => e.number)) + 1;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await adminFetch<{ id: number; number: number }>("/api/admin/event-card", {
        method: "POST",
        body: JSON.stringify({
          number: Number(form.number),
          date: form.date || null,
          location: form.location,
          schedule: form.schedule,
          track_direction: form.track_direction,
        }),
      });
      if (trackFile) {
        const body = new FormData();
        body.append("track", trackFile);
        await adminFetch(`/api/admin/events/${saved.id}/track`, { method: "POST", body });
      }
      setMessage({ tone: "ok", text: `Etapa ${saved.number} salva. A prévia abaixo já usa os dados novos.` });
      load(saved.number);
      setNonce(Date.now());
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const removeTrack = async () => {
    if (!window.confirm("Remover o traçado desta etapa?")) return;
    await adminFetch(`/api/admin/events/${card.id}/track`, { method: "DELETE" });
    load(card.event.number);
    setNonce(Date.now());
  };

  const query = new URLSearchParams({ etapa: String(savedNumber ?? "") });
  if (format === "story") query.set("formato", "story");
  const previewUrl = savedNumber ? `/arte/proxima-etapa?${query}&v=${nonce}` : null;
  const downloadUrl = savedNumber ? `/arte/proxima-etapa?${query}&download=1` : null;
  const dirty = String(savedNumber) !== form.number;

  return (
    <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
      <div className="flex flex-col gap-4">
        <Field label="Etapa">
          <select
            value={card.events.some((e) => String(e.number) === form.number) ? form.number : "new"}
            onChange={(e) => {
              if (e.target.value === "new") {
                setForm({
                  number: String(nextNumber),
                  date: "",
                  location: "",
                  schedule: {},
                  track_direction: "",
                });
                setSavedNumber(null);
              } else {
                load(Number(e.target.value));
              }
            }}
            className={inputClass}
          >
            {card.events.map((e) => (
              <option key={e.number} value={e.number}>
                Etapa {e.number}
                {e.location ? ` · ${e.location}` : ""}
                {e.status === "done" ? " (realizada)" : ""}
              </option>
            ))}
            <option value="new">Nova etapa…</option>
          </select>
        </Field>
        <div className="grid grid-cols-[5rem_1fr] gap-3">
          <Field label="Número">
            <input
              type="number"
              min={1}
              value={form.number}
              onChange={(e) => set("number", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Data">
            <input
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Local">
          <input
            value={form.location}
            onChange={(e) => set("location", e.target.value)}
            placeholder="Kartódromo"
            className={inputClass}
          />
        </Field>
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="eyebrow mb-1.5">Horários</legend>
          {SLOTS.map((slot) => (
            <Field key={slot.key} label={slot.label}>
              <input
                type="time"
                value={form.schedule[slot.key] ?? ""}
                onChange={(e) => set("schedule", { ...form.schedule, [slot.key]: e.target.value })}
                className={inputClass}
              />
            </Field>
          ))}
        </fieldset>
        <fieldset>
          <legend className="eyebrow mb-1.5">Sentido da pista</legend>
          <div className="flex gap-2">
            {(
              [
                ["cw", "Horário"],
                ["ccw", "Anti-horário"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={form.track_direction === value}
                onClick={() => set("track_direction", value)}
                className={clsx(
                  "flex-1 border px-3 py-2 text-sm",
                  form.track_direction === value
                    ? "border-red bg-red-soft"
                    : "border-line-strong hover:border-red",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
        <Field
          label="Traçado (PNG, JPG ou WebP até 5 MB)"
          hint="Envie só o desenho da pista, sem textos. O sistema redesenha a linha em branco com brilho vermelho."
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => chooseTrack(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-3 file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-text"
          />
        </Field>
        {(trackPreview || card.track_art) && (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={trackPreview ?? card.track_art ?? ""}
              alt="Traçado"
              className="h-20 w-32 border border-line bg-bg object-contain"
            />
            <span className="text-xs text-muted">
              {trackPreview ? "Novo traçado (será enviado ao salvar)" : "Traçado atual"}
            </span>
            {!trackPreview && card.track_art && (
              <button type="button" onClick={removeTrack} className="text-xs text-red hover:underline">
                Remover
              </button>
            )}
          </div>
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

        {message && <Notice tone={message.tone}>{message.text}</Notice>}

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy || !form.number}>
            {busy ? "Salvando…" : "Salvar e gerar prévia"}
          </Button>
          {downloadUrl && !dirty && (
            <a
              href={downloadUrl}
              download
              className="cut-sm inline-flex items-center justify-center border border-line-strong px-4 py-2 text-sm font-semibold hover:border-red"
            >
              Baixar PNG
            </a>
          )}
        </div>
      </div>

      <div className="flex justify-center">
        {previewUrl && !dirty ? (
          <div
            className="relative w-full max-w-[460px] border border-line bg-surface"
            style={{ aspectRatio: FORMATS[format].ratio }}
          >
            {!loaded && (
              <span className="eyebrow absolute inset-0 flex items-center justify-center">Gerando arte…</span>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={previewUrl}
              src={previewUrl}
              alt={`Arte da próxima etapa ${savedNumber}`}
              onLoad={() => setLoaded(true)}
              className="relative h-full w-full object-contain"
            />
          </div>
        ) : (
          <p className="self-center text-sm text-muted">
            Preencha os dados e clique em Salvar e gerar prévia.
          </p>
        )}
      </div>
    </div>
  );
}
