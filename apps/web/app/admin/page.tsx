"use client";

import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";

import { Button, Notice, PageTitle } from "@/components/admin/ui";
import { adminFetch } from "@/lib/client";

type Issue = {
  level: "error" | "warning";
  message: string;
  sheet: string;
  line: number | null;
  column: string;
};
type DriverMatch = {
  name: string;
  status: "matched" | "suggestion" | "new";
  driver?: { id: number; name: string };
  suggestions?: { id: number; name: string; score: number }[];
};
type Report = {
  format: string;
  events: {
    season: number;
    number: number;
    date: string | null;
    location: string;
    done: boolean;
    races: number;
  }[];
  races: {
    key: string;
    event: number;
    label: string;
    category: string | null;
    rows: number;
    state: string;
    existing_rows: number;
    table: string | null;
  }[];
  drivers: DriverMatch[];
  pending_drivers: string[];
  issues: Issue[];
  errors: number;
  warnings: number;
  official_check: { checked: number; mismatches: number };
  movements?: {
    compared: boolean;
    rows: {
      category: string;
      driver: string;
      before_position: number | null;
      after_position: number;
      before_points: number | null;
      after_points: number;
      change: number | null;
    }[];
  };
  summary: { new: number; replace: number; unchanged: number };
};
type Batch = {
  id: number;
  filename: string;
  author: string | null;
  created_at: string;
  status: "preview" | "confirmed" | "undone" | "discarded";
  status_label: string;
  rows: number;
  rows_written: number;
  errors: number;
  warnings: number;
  report?: Report;
};
type Choice = { action: "link"; driver_id: number } | { action: "create" };

const STATE_LABEL: Record<string, string> = { new: "Nova", replace: "Substitui", unchanged: "Sem alteração" };

export default function ImportPage() {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [history, setHistory] = useState<Batch[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);

  const loadHistory = useCallback(() => {
    adminFetch<Batch[]>("/api/admin/imports")
      .then(setHistory)
      .catch(() => undefined);
  }, []);
  useEffect(loadHistory, [loadHistory]);

  const upload = async (file: File) => {
    setMessage(null);
    setBatch(null);
    setChoices({});
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ tone: "error", text: "A planilha deve ter no máximo 5 MB." });
      return;
    }
    const body = new FormData();
    body.append("file", file);
    setBusy(true);
    try {
      setBatch(await adminFetch<Batch>("/api/admin/imports/preview", { method: "POST", body }));
      loadHistory();
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!batch) return;
    setBusy(true);
    try {
      const result = await adminFetch<Batch & { result: { rows_written: number } }>(
        `/api/admin/imports/${batch.id}/confirm`,
        { method: "POST", body: JSON.stringify({ drivers: choices }) },
      );
      setMessage({
        tone: "ok",
        text: `Importação gravada: ${result.result.rows_written} resultados. Classificação e estatísticas recalculadas; o site já mostra os novos dados.`,
      });
      setBatch(null);
      loadHistory();
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const undo = async (item: Batch) => {
    const verb = item.status === "preview" ? "Descartar a pré-visualização" : "Desfazer a importação";
    if (!window.confirm(`${verb} de “${item.filename}”? A classificação será recalculada.`)) return;
    setBusy(true);
    try {
      await adminFetch(`/api/admin/imports/${item.id}/undo`, { method: "POST" });
      setMessage({
        tone: "ok",
        text: item.status === "preview" ? "Pré-visualização descartada." : "Importação desfeita.",
      });
      if (batch?.id === item.id) setBatch(null);
      loadHistory();
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const report = batch?.report;
  const pending = report?.pending_drivers.filter((name) => !choices[name]) ?? [];
  const canConfirm = report && report.errors === 0 && pending.length === 0 && !busy;

  return (
    <div className="max-w-5xl">
      <PageTitle title="Importar resultados" />

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) upload(file);
        }}
        className={clsx(
          "cut flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-red bg-red-soft" : "border-line-strong bg-surface hover:border-red",
        )}
      >
        <span className="display text-2xl font-bold">
          {busy ? "Lendo planilha…" : "Arraste a planilha ou clique para escolher"}
        </span>
        <span className="text-sm text-muted">
          .xlsx da organização (aba “Etapas 2026” + abas RK1/RK2/RK3) ou .csv no formato longo · até 5 MB
        </span>
        <input
          type="file"
          accept=".xlsx,.xlsm,.csv"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />
      </label>

      {message && (
        <div className="mt-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      {report && batch && (
        <section className="mt-8 flex flex-col gap-6" aria-label="Pré-visualização">
          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-5">
            <Counter label="Corridas novas" value={report.summary.new} />
            <Counter
              label="Substituídas"
              value={report.summary.replace}
              tone={report.summary.replace ? "warn" : undefined}
            />
            <Counter label="Sem alteração" value={report.summary.unchanged} />
            <Counter label="Erros" value={report.errors} tone={report.errors ? "error" : undefined} />
            <Counter label="Avisos" value={report.warnings} />
          </div>

          {report.movements && <Movements movements={report.movements} />}

          {report.official_check.checked > 0 && (
            <Notice tone={report.official_check.mismatches ? "error" : "ok"}>
              Conferência com as abas de classificação da planilha: {report.official_check.checked} totais
              verificados, {report.official_check.mismatches} divergência(s).
            </Notice>
          )}

          {report.issues.length > 0 && (
            <div>
              <h2 className="display text-2xl font-bold">Erros e avisos</h2>
              <p className="text-sm text-muted">
                Nada é gravado enquanto houver erro. Corrija a planilha e envie de novo.
              </p>
              <div className="scrollbar-thin mt-3 max-h-80 overflow-auto border border-line">
                <table className="w-full text-sm">
                  <thead className="eyebrow sticky top-0 bg-surface text-left">
                    <tr>
                      <th className="p-2 font-normal">Tipo</th>
                      <th className="p-2 font-normal">Aba</th>
                      <th className="p-2 font-normal">Linha</th>
                      <th className="p-2 font-normal">Coluna</th>
                      <th className="p-2 font-normal">Mensagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.issues.map((issue, i) => (
                      <tr
                        key={i}
                        className={clsx("border-t border-line", issue.level === "error" && "bg-red-soft")}
                      >
                        <td className={clsx("p-2", issue.level === "error" ? "text-red" : "text-muted")}>
                          {issue.level === "error" ? "Erro" : "Aviso"}
                        </td>
                        <td className="num p-2">{issue.sheet || "—"}</td>
                        <td className="num p-2">{issue.line ?? "—"}</td>
                        <td className="num p-2">{issue.column || "—"}</td>
                        <td className="p-2">{issue.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DriverDecisions drivers={report.drivers} choices={choices} setChoices={setChoices} />

          <div>
            <h2 className="display text-2xl font-bold">Corridas no arquivo</h2>
            <div className="scrollbar-thin mt-3 max-h-80 overflow-auto border border-line">
              <table className="w-full text-sm">
                <thead className="eyebrow sticky top-0 bg-surface text-left">
                  <tr>
                    <th className="p-2 font-normal">Etapa</th>
                    <th className="p-2 font-normal">Corrida</th>
                    <th className="p-2 font-normal">Categoria</th>
                    <th className="p-2 font-normal">Tabela</th>
                    <th className="p-2 text-right font-normal">Linhas</th>
                    <th className="p-2 font-normal">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {report.races.map((race) => (
                    <tr key={race.key} className="border-t border-line">
                      <td className="num p-2">E{race.event}</td>
                      <td className="p-2">{race.label}</td>
                      <td className="p-2">{race.category ?? "Pré-temporada"}</td>
                      <td className="p-2">{race.table ?? "—"}</td>
                      <td className="num p-2 text-right">{race.rows}</td>
                      <td className="p-2">
                        <span
                          className={clsx(
                            "num border px-1.5 text-[11px] uppercase",
                            race.state === "replace" && "border-red/60 text-red",
                            race.state === "new" && "border-up/60 text-up",
                            race.state === "unchanged" && "border-line-strong text-muted",
                          )}
                        >
                          {STATE_LABEL[race.state]}
                          {race.state === "replace" ? ` (${race.existing_rows} linhas atuais)` : ""}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={confirm} disabled={!canConfirm}>
              Confirmar e gravar
            </Button>
            <Button variant="ghost" onClick={() => undo(batch)} disabled={busy}>
              Descartar
            </Button>
            {pending.length > 0 && (
              <span className="text-sm text-red">
                Decida os {pending.length} piloto(s) pendente(s) acima.
              </span>
            )}
            {report.errors > 0 && (
              <span className="text-sm text-red">Corrija os erros para poder gravar.</span>
            )}
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="display text-2xl font-bold">Histórico de importações</h2>
        <div className="mt-3 overflow-x-auto border border-line">
          <table className="w-full text-sm">
            <thead className="eyebrow bg-surface text-left">
              <tr>
                <th className="p-2 font-normal">#</th>
                <th className="p-2 font-normal">Arquivo</th>
                <th className="p-2 font-normal">Autor</th>
                <th className="p-2 font-normal">Data</th>
                <th className="p-2 font-normal">Situação</th>
                <th className="p-2 text-right font-normal">Gravadas</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id} className="border-t border-line">
                  <td className="num p-2 text-muted">{item.id}</td>
                  <td className="p-2">{item.filename}</td>
                  <td className="p-2 text-muted">{item.author ?? "—"}</td>
                  <td className="num p-2 text-muted">{new Date(item.created_at).toLocaleString("pt-BR")}</td>
                  <td className="p-2">{item.status_label}</td>
                  <td className="num p-2 text-right">{item.rows_written}</td>
                  <td className="p-2 text-right">
                    {(item.status === "confirmed" || item.status === "preview") && (
                      <button
                        type="button"
                        className="text-xs text-red hover:underline"
                        onClick={() => undo(item)}
                        disabled={busy}
                      >
                        {item.status === "confirmed" ? "Desfazer" : "Descartar"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-muted">
                    Nenhuma importação ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone?: "error" | "warn" }) {
  return (
    <div className="bg-surface p-4">
      <p className="eyebrow">{label}</p>
      <p
        className={clsx(
          "num mt-1 text-3xl font-bold",
          tone === "error" && "text-red",
          tone === "warn" && "text-[#ffb020]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function DriverDecisions({
  drivers,
  choices,
  setChoices,
}: {
  drivers: DriverMatch[];
  choices: Record<string, Choice>;
  setChoices: React.Dispatch<React.SetStateAction<Record<string, Choice>>>;
}) {
  const suggestions = drivers.filter((d) => d.status === "suggestion");
  const created = drivers.filter((d) => d.status === "new");
  const matched = drivers.filter((d) => d.status === "matched").length;
  if (!suggestions.length && !created.length) {
    return <Notice tone="ok">Todos os {matched} pilotos já estão cadastrados.</Notice>;
  }
  return (
    <div>
      <h2 className="display text-2xl font-bold">Vínculo de pilotos</h2>
      <p className="text-sm text-muted">
        {matched} já cadastrados. Nomes parecidos com um cadastro existente precisam de decisão, para evitar
        duplicatas.
      </p>
      {suggestions.length > 0 && (
        <ul className="mt-3 divide-y divide-line border border-line">
          {suggestions.map((d) => (
            <li
              key={d.name}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span>
                <b>{d.name}</b> <span className="text-sm text-muted">na planilha</span>
              </span>
              <span className="flex flex-wrap gap-2">
                {d.suggestions?.map((s) => {
                  const active =
                    choices[d.name]?.action === "link" &&
                    (choices[d.name] as { driver_id: number }).driver_id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setChoices((c) => ({ ...c, [d.name]: { action: "link", driver_id: s.id } }))
                      }
                      className={clsx(
                        "border px-2 py-1 text-sm",
                        active ? "border-red bg-red-soft" : "border-line-strong hover:border-red",
                      )}
                    >
                      É {s.name} <span className="num text-xs text-muted">{Math.round(s.score * 100)}%</span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setChoices((c) => ({ ...c, [d.name]: { action: "create" } }))}
                  className={clsx(
                    "border px-2 py-1 text-sm",
                    choices[d.name]?.action === "create"
                      ? "border-red bg-red-soft"
                      : "border-line-strong hover:border-red",
                  )}
                >
                  Criar novo piloto
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {created.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          Serão cadastrados como novos:{" "}
          <span className="text-text">{created.map((d) => d.name).join(", ")}</span>.
        </p>
      )}
    </div>
  );
}

function Movements({ movements }: { movements: NonNullable<Report["movements"]> }) {
  const [all, setAll] = useState(false);
  if (!movements.compared && !movements.rows.length) {
    return <Notice>Primeira importação desta categoria: ainda não há classificação para comparar.</Notice>;
  }
  const moved = movements.rows.filter((r) => r.change !== 0);
  const shown = all ? movements.rows : moved;
  if (!movements.rows.length) {
    return <Notice tone="ok">A classificação não muda com este arquivo.</Notice>;
  }
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-2xl font-bold">Como a classificação vai ficar</h2>
          <p className="text-sm text-muted">
            {moved.length} piloto(s) mudam de posição; {movements.rows.length - moved.length} só mudam de
            pontos.
          </p>
        </div>
        {movements.rows.length > moved.length && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            Mostrar também quem só muda de pontos
          </label>
        )}
      </div>
      <div className="scrollbar-thin mt-3 max-h-80 overflow-auto border border-line">
        <table className="w-full text-sm">
          <thead className="eyebrow sticky top-0 bg-surface text-left">
            <tr>
              <th className="p-2 font-normal">Cat.</th>
              <th className="p-2 font-normal">Piloto</th>
              <th className="p-2 text-right font-normal">Antes</th>
              <th className="p-2 text-right font-normal">Depois</th>
              <th className="p-2 text-right font-normal">Variação</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={`${r.category}-${r.driver}`} className="border-t border-line">
                <td className="num p-2 text-xs text-muted">{r.category}</td>
                <td className="p-2">{r.driver}</td>
                <td className="num p-2 text-right text-muted">
                  {r.before_position ? `${r.before_position}º · ${r.before_points} pts` : "—"}
                </td>
                <td className="num p-2 text-right">
                  {r.after_position}º · {r.after_points} pts
                </td>
                <td className="num p-2 text-right">
                  {r.change === null ? (
                    <span className="text-xs uppercase text-red">novo</span>
                  ) : r.change > 0 ? (
                    <span className="text-up">▲ {r.change}</span>
                  ) : r.change < 0 ? (
                    <span className="text-red">▼ {Math.abs(r.change)}</span>
                  ) : (
                    <span className="text-faint">–</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
