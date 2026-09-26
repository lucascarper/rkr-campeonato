"use client";

import clsx from "clsx";
import { useState } from "react";

import { adminFetch } from "@/lib/client";
import { matchDriver } from "@/lib/photoMatch";

import { Button, Notice, inputClass } from "./ui";

type Driver = { id: number; name: string; slug: string; photo_url: string | null };
type Item = {
  file: File;
  preview: string;
  driverId: number | null;
  status: "pending" | "sending" | "ok" | "error";
  error?: string;
};

/** Envio de várias fotos de uma vez: cada arquivo é associado ao piloto pelo nome. */
export function BatchPhotos({ drivers, onDone }: { drivers: Driver[]; onDone: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  const choose = (files: FileList | null) => {
    items.forEach((i) => URL.revokeObjectURL(i.preview));
    setItems(
      Array.from(files ?? [])
        .filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type))
        .map((file) => ({
          file,
          preview: URL.createObjectURL(file),
          driverId: matchDriver(file.name, drivers)?.id ?? null,
          status: "pending" as const,
        })),
    );
  };

  const send = async () => {
    setBusy(true);
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.driverId || item.status === "ok") continue;
      setItems((list) => list.map((x, j) => (j === i ? { ...x, status: "sending" } : x)));
      const body = new FormData();
      body.append("photo", item.file);
      try {
        await adminFetch(`/api/admin/drivers/${item.driverId}/photo`, { method: "POST", body });
        setItems((list) => list.map((x, j) => (j === i ? { ...x, status: "ok" } : x)));
      } catch (e) {
        setItems((list) =>
          list.map((x, j) => (j === i ? { ...x, status: "error", error: (e as Error).message } : x)),
        );
      }
    }
    setBusy(false);
    onDone();
  };

  const ready = items.filter((i) => i.driverId && i.status !== "ok").length;
  const unmatched = items.filter((i) => !i.driverId).length;
  const sent = items.filter((i) => i.status === "ok").length;

  return (
    <div className="panel cut mb-6 flex flex-col gap-4 p-5">
      <div>
        <h2 className="display text-2xl font-bold">Fotos em lote</h2>
        <p className="text-sm text-muted">
          Nomeie cada arquivo com o nome do piloto (ex.: <span className="num">joao-vitor-buzin.jpg</span> ou{" "}
          <span className="num">Buzin.png</span>). JPG, PNG ou WebP até 5 MB cada.
        </p>
      </div>
      <input
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(e) => choose(e.target.files)}
        className="text-sm file:mr-3 file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-text"
      />
      {items.length > 0 && (
        <>
          <div className="max-h-96 overflow-auto border border-line">
            <table className="w-full text-sm">
              <thead className="eyebrow sticky top-0 bg-surface text-left">
                <tr>
                  <th className="p-2 font-normal">Foto</th>
                  <th className="p-2 font-normal">Arquivo</th>
                  <th className="p-2 font-normal">Piloto</th>
                  <th className="p-2 font-normal">Situação</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.preview} className="border-t border-line">
                    <td className="p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.preview} alt="" className="h-10 w-8 object-cover" />
                    </td>
                    <td className="num max-w-[12rem] truncate p-2 text-xs text-muted">{item.file.name}</td>
                    <td className="p-2">
                      <select
                        value={item.driverId ?? ""}
                        disabled={busy || item.status === "ok"}
                        onChange={(e) =>
                          setItems((list) =>
                            list.map((x, j) =>
                              j === i ? { ...x, driverId: Number(e.target.value) || null } : x,
                            ),
                          )
                        }
                        className={clsx(inputClass, "w-full py-1.5 text-xs", !item.driverId && "border-red")}
                      >
                        <option value="">Escolha o piloto</option>
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                            {d.photo_url ? " (troca a foto atual)" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 text-xs">
                      {item.status === "ok" && <span className="text-up">Enviada</span>}
                      {item.status === "sending" && <span className="text-muted">Enviando…</span>}
                      {item.status === "error" && <span className="text-red">{item.error}</span>}
                      {item.status === "pending" && (
                        <span className={item.driverId ? "text-muted" : "text-red"}>
                          {item.driverId ? "Pronta" : "Sem piloto"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {unmatched > 0 && (
            <Notice>
              {unmatched} arquivo(s) sem piloto associado: escolha na lista ou eles serão ignorados.
            </Notice>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={send} disabled={busy || ready === 0}>
              {busy ? "Enviando…" : `Enviar ${ready} foto(s)`}
            </Button>
            {sent > 0 && <span className="text-sm text-up">{sent} enviada(s).</span>}
          </div>
        </>
      )}
    </div>
  );
}
