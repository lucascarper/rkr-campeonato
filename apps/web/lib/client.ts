"use client";

import type { DriverProfile } from "./types";

/** Chamadas do navegador: sempre na mesma origem (/api), que o Next repassa ao Django. */
export async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init });
  if (!response.ok) {
    let detail = `Erro ${response.status}`;
    try {
      const body = await response.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      // Sem JSON: a requisição foi barrada antes da api (ex.: domínio fora de DJANGO_ALLOWED_HOSTS).
      if (response.status === 400) {
        detail =
          "O servidor recusou o endereço deste site (erro 400). Inclua o domínio do site em DJANGO_ALLOWED_HOSTS e CSRF_TRUSTED_ORIGINS no serviço da api.";
      }
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

// Cache em memória dos perfis: a janela abre instantaneamente quando o dado já foi buscado no hover.
const driverCache = new Map<string, Promise<DriverProfile>>();

export function loadDriver(slug: string, category: string, upto?: number | null): Promise<DriverProfile> {
  const query = new URLSearchParams({ category });
  if (upto) query.set("upto", String(upto));
  const key = `${slug}?${query}`;
  let pending = driverCache.get(key);
  if (!pending) {
    pending = fetchJSON<DriverProfile>(`/api/drivers/${slug}?${query}`);
    pending.catch(() => driverCache.delete(key));
    driverCache.set(key, pending);
  }
  return pending;
}

export function prefetchDriver(slug: string, category: string, upto?: number | null) {
  loadDriver(slug, category, upto).catch(() => undefined);
}

// --- painel administrativo --------------------------------------------------------------------

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.method && init.method !== "GET") headers.set("X-CSRFToken", csrfToken());
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  return fetchJSON<T>(path, { ...init, headers });
}
