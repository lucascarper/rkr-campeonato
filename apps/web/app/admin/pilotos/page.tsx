"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DriverAvatar } from "@/components/DriverAvatar";
import { Button, Field, Notice, PageTitle, inputClass } from "@/components/admin/ui";
import { CATEGORIES } from "@/lib/categories";
import { adminFetch } from "@/lib/client";

type AdminDriver = {
  id: number;
  name: string;
  nickname: string;
  slug: string;
  number: number | null;
  category: string | null;
  active: boolean;
  hidden: boolean;
  photo_url: string | null;
  thumb_url: string | null;
  results: number;
};

export default function DriversPage() {
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminDriver | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(() => {
    adminFetch<AdminDriver[]>("/api/admin/drivers")
      .then(setDrivers)
      .catch((e) => setMessage({ tone: "error", text: e.message }));
  }, []);
  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const q = query
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
    return drivers.filter((d) =>
      d.name
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .includes(q),
    );
  }, [drivers, query]);

  const create = async () => {
    const name = window.prompt("Nome completo do piloto");
    if (!name?.trim()) return;
    try {
      const driver = await adminFetch<AdminDriver>("/api/admin/drivers", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      setEditing({ ...driver, results: 0 });
      load();
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    }
  };

  return (
    <div className="max-w-6xl">
      <PageTitle title="Pilotos">
        <div className="flex gap-2">
          <input
            type="search"
            placeholder="Buscar piloto"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={inputClass}
          />
          <Button onClick={create}>Cadastrar piloto</Button>
        </div>
      </PageTitle>
      {message && (
        <div className="mb-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="overflow-x-auto border border-line">
          <table className="w-full text-sm">
            <thead className="eyebrow bg-surface text-left">
              <tr>
                <th className="p-2 font-normal">Piloto</th>
                <th className="p-2 font-normal">Categoria</th>
                <th className="p-2 text-right font-normal">Corridas</th>
                <th className="p-2 font-normal">Site</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setEditing(d)}
                  className={clsx(
                    "cursor-pointer border-t border-line hover:bg-red-soft",
                    editing?.id === d.id && "bg-red-soft",
                  )}
                >
                  <td className="p-2">
                    <span className="flex items-center gap-2">
                      <DriverAvatar name={d.name} photo={d.thumb_url} size={28} />
                      <span>
                        {d.name}
                        {d.nickname && <span className="text-muted"> · {d.nickname}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="p-2">{d.category ?? <span className="text-red">sem categoria</span>}</td>
                  <td className="num p-2 text-right">{d.results}</td>
                  <td className="p-2">
                    {d.hidden ? (
                      <span className="text-red">oculto</span>
                    ) : (
                      <span className="text-muted">visível</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editing ? (
          <DriverEditor
            key={editing.id}
            driver={editing}
            others={drivers.filter((d) => d.id !== editing.id)}
            onSaved={(d, text) => {
              setEditing(d);
              setMessage({ tone: "ok", text });
              load();
            }}
            onError={(text) => setMessage({ tone: "error", text })}
            onMerged={(text) => {
              setEditing(null);
              setMessage({ tone: "ok", text });
              load();
            }}
          />
        ) : (
          <p className="text-sm text-muted">Selecione um piloto para editar dados, categoria e foto.</p>
        )}
      </div>
    </div>
  );
}

function DriverEditor({
  driver,
  others,
  onSaved,
  onError,
  onMerged,
}: {
  driver: AdminDriver;
  others: AdminDriver[];
  onSaved: (d: AdminDriver, message: string) => void;
  onError: (message: string) => void;
  onMerged: (message: string) => void;
}) {
  const [form, setForm] = useState(driver);
  const [busy, setBusy] = useState(false);
  const [mergeInto, setMergeInto] = useState("");

  const save = async () => {
    setBusy(true);
    try {
      const saved = await adminFetch<AdminDriver>(`/api/admin/drivers/${driver.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          nickname: form.nickname,
          number: form.number,
          category: form.category,
          hidden: form.hidden,
          active: form.active,
        }),
      });
      onSaved({ ...saved, results: driver.results }, "Piloto salvo. Classificação recalculada.");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
      return onError("Envie JPG, PNG ou WebP.");
    if (file.size > 5 * 1024 * 1024) return onError("A foto deve ter no máximo 5 MB.");
    const body = new FormData();
    body.append("photo", file);
    setBusy(true);
    try {
      const saved = await adminFetch<AdminDriver>(`/api/admin/drivers/${driver.id}/photo`, {
        method: "POST",
        body,
      });
      setForm((f) => ({ ...f, photo_url: saved.photo_url, thumb_url: saved.thumb_url }));
      onSaved({ ...saved, results: driver.results }, "Foto atualizada.");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const merge = async () => {
    const target = others.find((d) => String(d.id) === mergeInto);
    if (!target) return;
    if (
      !window.confirm(`Unir “${driver.name}” em “${target.name}”? Os resultados passam para ${target.name}.`)
    )
      return;
    setBusy(true);
    try {
      const result = await adminFetch<{ moved: number }>(`/api/admin/drivers/${driver.id}/merge`, {
        method: "POST",
        body: JSON.stringify({ into: target.id }),
      });
      onMerged(`${result.moved} resultado(s) movidos para ${target.name}.`);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel cut flex flex-col gap-4 self-start p-5">
      <div className="flex items-center gap-4">
        <DriverAvatar name={form.name} photo={form.photo_url} size={72} />
        <label className="cursor-pointer text-sm text-red hover:underline">
          {form.photo_url ? "Trocar foto" : "Enviar foto"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadPhoto(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted">
        JPG, PNG ou WebP até 5 MB. O sistema recorta e gera as versões do site.
      </p>
      <Field label="Nome">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Apelido">
          <input
            value={form.nickname}
            onChange={(e) => setForm({ ...form, nickname: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Número">
          <input
            type="number"
            min={0}
            value={form.number ?? ""}
            onChange={(e) => setForm({ ...form, number: e.target.value ? Number(e.target.value) : null })}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Categoria atual" hint="Define para qual categoria vão os pontos da pré-temporada.">
        <select
          value={form.category ?? ""}
          onChange={(e) => setForm({ ...form, category: e.target.value || null })}
          className={inputClass}
        >
          <option value="">Sem categoria</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.hidden}
          onChange={(e) => setForm({ ...form, hidden: e.target.checked })}
        />
        Ocultar nome e foto no site público
      </label>
      <Button onClick={save} disabled={busy}>
        Salvar piloto
      </Button>

      <div className="border-t border-line pt-4">
        <p className="eyebrow">Unir cadastro duplicado</p>
        <div className="mt-2 flex gap-2">
          <select
            value={mergeInto}
            onChange={(e) => setMergeInto(e.target.value)}
            className={clsx(inputClass, "min-w-0 flex-1")}
          >
            <option value="">Escolha o cadastro correto</option>
            {others.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <Button variant="danger" onClick={merge} disabled={!mergeInto || busy}>
            Unir
          </Button>
        </div>
      </div>
    </div>
  );
}
