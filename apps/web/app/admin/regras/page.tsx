"use client";

import { useEffect, useState } from "react";

import { Button, Field, Notice, PageTitle, inputClass } from "@/components/admin/ui";
import { adminFetch } from "@/lib/client";

type Table = { name: string; is_default: boolean; rules: { position: number; points: number }[] };
type Rules = {
  season: number;
  discards: number;
  discard_absences: boolean;
  consistency_top_n: number;
  tiebreak_order: string[];
  tiebreak_options: Record<string, string>;
  pole_bonus: number;
  fastest_lap_bonus: number;
  fastest_lap_min_position: number;
  dnf_points: number;
  shirt_penalty: number;
  tables: Table[];
};

export default function RulesPage() {
  const [rules, setRules] = useState<Rules | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    adminFetch<Rules>("/api/admin/rules")
      .then(setRules)
      .catch((e) => setMessage({ tone: "error", text: e.message }));
  }, []);

  if (!rules) return <div className="text-muted">{message?.text ?? "Carregando…"}</div>;

  const set = <K extends keyof Rules>(key: K, value: Rules[K]) => setRules({ ...rules, [key]: value });
  const setTable = (index: number, table: Table) =>
    set(
      "tables",
      rules.tables.map((t, i) => (i === index ? table : t)),
    );

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await adminFetch<Rules & { recalculated: { results: number } }>("/api/admin/rules", {
        method: "PUT",
        body: JSON.stringify(rules),
      });
      setRules(saved);
      setMessage({
        tone: "ok",
        text: `Regras salvas. ${saved.recalculated.results} resultados recalculados.`,
      });
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const recalc = async () => {
    setBusy(true);
    try {
      const r = await adminFetch<{ results: number }>("/api/admin/recalculate", {
        method: "POST",
        body: "{}",
      });
      setMessage({
        tone: "ok",
        text: `Classificações e estatísticas recalculadas (${r.results} resultados).`,
      });
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const moveTiebreak = (index: number, dir: -1 | 1) => {
    const order = [...rules.tiebreak_order];
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    set("tiebreak_order", order);
  };

  const unused = Object.keys(rules.tiebreak_options).filter((k) => !rules.tiebreak_order.includes(k));
  const num = (value: string) => (value === "" ? 0 : Number(value));

  return (
    <div className="max-w-5xl">
      <PageTitle title={`Regras ${rules.season}`}>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={recalc} disabled={busy}>
            Recalcular agora
          </Button>
          <Button onClick={save} disabled={busy}>
            Salvar e recalcular
          </Button>
        </div>
      </PageTitle>
      {message && (
        <div className="mb-6">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Descartes (visão da janela do piloto)" hint="A classificação geral nunca descarta.">
          <input
            type="number"
            min={0}
            value={rules.discards}
            onChange={(e) => set("discards", num(e.target.value))}
            className={inputClass}
          />
        </Field>
        <label className="flex items-start gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            checked={rules.discard_absences}
            onChange={(e) => set("discard_absences", e.target.checked)}
            className="mt-1"
          />
          <span>
            Faltas podem ser descartadas
            <span className="block text-xs text-muted">
              Etapa que o piloto não correu conta como 0 e entra nos descartes.
            </span>
          </span>
        </label>
        <Field label="Consistência: top N" hint="Percentual de corridas entre os N primeiros.">
          <input
            type="number"
            min={1}
            value={rules.consistency_top_n}
            onChange={(e) => set("consistency_top_n", num(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label="Bônus de pole">
          <input
            type="number"
            step="0.5"
            value={rules.pole_bonus}
            onChange={(e) => set("pole_bonus", num(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label="Bônus de volta mais rápida">
          <input
            type="number"
            step="0.5"
            value={rules.fastest_lap_bonus}
            onChange={(e) => set("fastest_lap_bonus", num(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label="Bônus de VR a partir da posição" hint="4 = só para quem termina fora do pódio.">
          <input
            type="number"
            min={1}
            value={rules.fastest_lap_min_position}
            onChange={(e) => set("fastest_lap_min_position", num(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label="Pontos para abandono (DNF)">
          <input
            type="number"
            step="0.5"
            value={rules.dnf_points}
            onChange={(e) => set("dnf_points", num(e.target.value))}
            className={inputClass}
          />
        </Field>
        <Field label="Desconto por camiseta" hint="Pontos retirados quando marcado na planilha.">
          <input
            type="number"
            step="0.5"
            value={rules.shirt_penalty}
            onChange={(e) => set("shirt_penalty", num(e.target.value))}
            className={inputClass}
          />
        </Field>
      </section>

      <section className="mt-10">
        <h2 className="display text-2xl font-bold">Critérios de desempate</h2>
        <p className="text-sm text-muted">
          Aplicados em ordem, depois dos pontos. Empate em todos: mesma posição.
        </p>
        <ol className="mt-3 flex flex-col gap-px bg-line">
          {rules.tiebreak_order.map((key, i) => (
            <li key={key} className="flex items-center justify-between gap-3 bg-surface p-3 text-sm">
              <span>
                <span className="num mr-3 text-red">{i + 1}</span>
                {rules.tiebreak_options[key]}
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  className="border border-line-strong px-2"
                  onClick={() => moveTiebreak(i, -1)}
                  aria-label="Subir"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="border border-line-strong px-2"
                  onClick={() => moveTiebreak(i, 1)}
                  aria-label="Descer"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="border border-line-strong px-2 text-red"
                  onClick={() =>
                    set(
                      "tiebreak_order",
                      rules.tiebreak_order.filter((k) => k !== key),
                    )
                  }
                  aria-label="Remover"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ol>
        {unused.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {unused.map((key) => (
              <button
                key={key}
                type="button"
                className="border border-dashed border-line-strong px-2 py-1 text-xs text-muted hover:text-text"
                onClick={() => set("tiebreak_order", [...rules.tiebreak_order, key])}
              >
                + {rules.tiebreak_options[key]}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="display text-2xl font-bold">Tabelas de pontos</h2>
            <p className="text-sm text-muted">
              Posição → pontos. Na importação, o sistema identifica qual tabela cada corrida usou.
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() =>
              set("tables", [
                ...rules.tables,
                {
                  name: `Tabela ${rules.tables.length + 1}`,
                  is_default: false,
                  rules: [{ position: 1, points: 0 }],
                },
              ])
            }
          >
            Nova tabela
          </Button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {rules.tables.map((table, index) => (
            <div key={index} className="panel p-4">
              <div className="flex items-center gap-3">
                <input
                  value={table.name}
                  onChange={(e) => setTable(index, { ...table, name: e.target.value })}
                  className={`${inputClass} flex-1`}
                  aria-label="Nome da tabela"
                />
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="radio"
                    name="default-table"
                    checked={table.is_default}
                    onChange={() =>
                      set(
                        "tables",
                        rules.tables.map((t, i) => ({ ...t, is_default: i === index })),
                      )
                    }
                  />
                  Padrão
                </label>
                {!table.is_default && (
                  <button
                    type="button"
                    className="text-xs text-red"
                    onClick={() =>
                      set(
                        "tables",
                        rules.tables.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Excluir
                  </button>
                )}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
                {table.rules.map((rule, r) => (
                  <label key={r} className="flex flex-col text-xs text-muted">
                    <span className="num">{rule.position}º</span>
                    <input
                      type="number"
                      step="0.5"
                      value={rule.points}
                      onChange={(e) =>
                        setTable(index, {
                          ...table,
                          rules: table.rules.map((x, j) =>
                            j === r ? { ...x, points: num(e.target.value) } : x,
                          ),
                        })
                      }
                      className={`${inputClass} num px-2 py-1`}
                    />
                  </label>
                ))}
              </div>
              <div className="mt-2 flex gap-3 text-xs">
                <button
                  type="button"
                  className="text-red"
                  onClick={() =>
                    setTable(index, {
                      ...table,
                      rules: [...table.rules, { position: table.rules.length + 1, points: 0 }],
                    })
                  }
                >
                  + posição
                </button>
                {table.rules.length > 1 && (
                  <button
                    type="button"
                    className="text-muted"
                    onClick={() => setTable(index, { ...table, rules: table.rules.slice(0, -1) })}
                  >
                    − última
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
