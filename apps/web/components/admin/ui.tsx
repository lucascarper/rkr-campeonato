"use client";

import clsx from "clsx";

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      {...props}
      className={clsx(
        "cut-sm inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-red text-white hover:bg-[#ff1a27]",
        variant === "ghost" && "border border-line-strong text-text hover:border-red",
        variant === "danger" && "border border-red/60 text-red hover:bg-red hover:text-white",
        className,
      )}
    />
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "cut-sm border border-line-strong bg-bg px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-red";

export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
      <h1 className="display flex items-center gap-3 text-4xl font-extrabold">
        <span aria-hidden className="h-7 w-1 bg-red shadow-[0_0_10px_var(--red-glow)]" />
        {title}
      </h1>
      {children}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "ok";
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={clsx(
        "border-l-2 px-4 py-3 text-sm",
        tone === "error" && "border-red bg-red-soft",
        tone === "ok" && "border-up bg-up/10",
        tone === "info" && "border-line-strong bg-surface",
      )}
    >
      {children}
    </div>
  );
}
