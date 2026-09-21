import "server-only";

import type { Dashboard, Standings } from "./types";

const API = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";

/** Busca no Django pela rede privada. O cache é renovado pela API após cada importação (/revalidate). */
async function get<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${API}${path}`, { next: { tags: ["rkr"], revalidate: 600 } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export function getStandings(category: string, upto?: number | null) {
  const query = new URLSearchParams({ category });
  if (upto) query.set("upto", String(upto));
  return get<Standings>(`/api/standings/?${query}`);
}

export function getDashboard(category: string, from?: number | null, to?: number | null) {
  const query = new URLSearchParams({ category });
  if (from) query.set("from", String(from));
  if (to) query.set("to", String(to));
  return get<Dashboard>(`/api/dashboard/?${query}`);
}
