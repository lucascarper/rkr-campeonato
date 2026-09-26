"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { CATEGORIES } from "@/lib/categories";

import { Logo } from "./Logo";

/** Cabeçalho fixo: logo à esquerda, seletor RK1/RK2/RK3 à direita e as duas telas públicas. */
export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  if (pathname.startsWith("/admin")) return null;
  const isDashboard = pathname.startsWith("/dashboard");
  const isCalendar = pathname.startsWith("/calendario");
  const segment = pathname.split("/").filter(Boolean).pop()?.toUpperCase();
  const current = CATEGORIES.find((c) => c === segment) ?? "RK1";
  const base = isDashboard ? "/dashboard/" : "/";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:h-16">
        <Logo />
        <nav aria-label="Categoria" className="flex items-center">
          {CATEGORIES.map((code) => {
            const active = code === current;
            return (
              <Link
                key={code}
                href={`${base}${code.toLowerCase()}`}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "display relative px-3 py-2 text-lg font-bold transition-colors sm:px-4 sm:text-xl",
                  active ? "text-text" : "text-muted hover:text-text",
                )}
              >
                {code}
                <span
                  className={clsx(
                    "absolute inset-x-2 -bottom-[9px] h-[2px] bg-red transition-opacity sm:-bottom-[13px]",
                    active ? "opacity-100 shadow-[0_0_12px_var(--red-glow)]" : "opacity-0",
                  )}
                />
              </Link>
            );
          })}
        </nav>
      </div>
      <nav aria-label="Seções" className="border-t border-line">
        <div className="mx-auto flex max-w-7xl gap-6 px-4">
          {[
            {
              href: `/${current.toLowerCase()}`,
              label: "Classificação",
              active: !isDashboard && !isCalendar,
            },
            { href: `/dashboard/${current.toLowerCase()}`, label: "Dashboard", active: isDashboard },
            { href: "/calendario", label: "Calendário", active: isCalendar },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={clsx(
                "eyebrow py-2.5 transition-colors",
                item.active ? "!text-text" : "hover:!text-text",
              )}
            >
              {item.active && <span className="mr-2 inline-block h-1.5 w-1.5 bg-red align-middle" />}
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
