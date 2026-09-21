"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { adminFetch } from "@/lib/client";

import { RMark } from "../Logo";
import { Button, Field, Notice, inputClass } from "./ui";

type Session = { authenticated: boolean; username?: string };

const NAV = [
  { href: "/admin", label: "Importar resultados" },
  { href: "/admin/pilotos", label: "Pilotos" },
  { href: "/admin/etapas", label: "Etapas" },
  { href: "/admin/regras", label: "Regras" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const pathname = usePathname();

  const refresh = useCallback(() => {
    adminFetch<Session>("/api/admin/session")
      .then(setSession)
      .catch(() => setSession({ authenticated: false }));
  }, []);
  useEffect(refresh, [refresh]);

  if (!session) return <div className="p-10 text-muted">Carregando…</div>;
  if (!session.authenticated) return <Login onDone={refresh} />;

  const logout = async () => {
    await adminFetch("/api/admin/logout", { method: "POST" });
    refresh();
  };

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-surface md:min-h-dvh md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-3 p-4 md:block">
          <Link href="/" className="flex items-center gap-2">
            <RMark className="h-7 w-auto" />
            <span className="display text-xl font-bold">Painel RKR</span>
          </Link>
          <p className="eyebrow md:mt-2">{session.username}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "whitespace-nowrap border-l-2 px-3 py-2 text-sm transition-colors",
                pathname === item.href
                  ? "border-red bg-red-soft text-text"
                  : "border-transparent text-muted hover:text-text",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden p-4 md:block">
          <Button variant="ghost" onClick={logout} className="w-full">
            Sair
          </Button>
        </div>
      </aside>
      <section className="min-w-0 p-4 md:p-8">{children}</section>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await adminFetch("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") }),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="panel cut flex w-full max-w-sm flex-col gap-4 p-6">
        <RMark className="h-10 w-auto self-start" />
        <h1 className="display text-3xl font-extrabold">Painel da organização</h1>
        <Field label="Usuário">
          <input name="username" autoComplete="username" required className={inputClass} />
        </Field>
        <Field label="Senha">
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" disabled={busy}>
          {busy ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
