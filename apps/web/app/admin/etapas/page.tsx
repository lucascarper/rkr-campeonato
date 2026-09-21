"use client";

import { useCallback, useEffect, useState } from "react";

import { Button, Notice, PageTitle, inputClass } from "@/components/admin/ui";
import { adminFetch } from "@/lib/client";

type AdminEvent = {
  id: number;
  number: number;
  date: string | null;
  location: string;
  status: "scheduled" | "done" | "cancelled";
  is_preseason: boolean;
  races: { id: number; label: string; category: string | null; table: string | null; results: number }[];
};

export default function EventsPage() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(() => {
    adminFetch<AdminEvent[]>("/api/admin/events")
      .then(setEvents)
      .catch((e) => setMessage({ tone: "error", text: e.message }));
  }, []);
  useEffect(load, [load]);

  const save = async (event: AdminEvent) => {
    try {
      await adminFetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          date: event.date,
          location: event.location,
          status: event.status,
          is_preseason: event.is_preseason,
        }),
      });
      setMessage({ tone: "ok", text: `Etapa ${event.number} salva.` });
      load();
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    }
  };

  const update = (id: number, patch: Partial<AdminEvent>) =>
    setEvents((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  return (
    <div className="max-w-5xl">
      <PageTitle title="Etapas e corridas" />
      <p className="mb-4 text-sm text-muted">
        As etapas são criadas pela importação. Aqui você ajusta data, local e situação. Etapas futuras
        aparecem como “Agendada” e viram “Realizada” quando os resultados são importados.
      </p>
      {message && (
        <div className="mb-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}
      <div className="flex flex-col gap-px bg-line">
        {events.map((event) => (
          <div
            key={event.id}
            className="grid gap-3 bg-surface p-4 md:grid-cols-[4rem_10rem_1fr_9rem_auto] md:items-center"
          >
            <span className="display text-3xl font-extrabold">
              E{event.number}
              {event.is_preseason && <span className="eyebrow ml-1 block !text-[10px]">pré</span>}
            </span>
            <input
              type="date"
              value={event.date ?? ""}
              onChange={(e) => update(event.id, { date: e.target.value || null })}
              className={inputClass}
              aria-label={`Data da etapa ${event.number}`}
            />
            <input
              value={event.location}
              onChange={(e) => update(event.id, { location: e.target.value })}
              placeholder="Kartódromo"
              className={inputClass}
              aria-label={`Local da etapa ${event.number}`}
            />
            <select
              value={event.status}
              onChange={(e) => update(event.id, { status: e.target.value as AdminEvent["status"] })}
              className={inputClass}
              aria-label={`Situação da etapa ${event.number}`}
            >
              <option value="scheduled">Agendada</option>
              <option value="done">Realizada</option>
              <option value="cancelled">Cancelada</option>
            </select>
            <Button variant="ghost" onClick={() => save(event)}>
              Salvar
            </Button>
            {event.races.length > 0 && (
              <p className="text-xs text-muted md:col-span-5">
                {event.races
                  .map(
                    (r) =>
                      `${r.label}${r.category ? ` ${r.category}` : ""} · ${r.results} pilotos · tabela ${r.table ?? "padrão"}`,
                  )
                  .join("  |  ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
