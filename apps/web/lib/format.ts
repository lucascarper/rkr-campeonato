const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: "America/Sao_Paulo",
});

/** "2026-09-12" -> "12 set" (a data vem sem hora; meio-dia evita virar o dia no fuso). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dateFmt
    .format(new Date(`${iso}T12:00:00-03:00`))
    .replace(".", "")
    .replace(" de ", " ");
}

/** Pontos sem casas decimais quando inteiros; vírgula decimal em pt-BR. */
export function formatPoints(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

export function formatDecimal(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(digits).replace(".", ",");
}

/** 41235 -> "0:41.235" */
export function formatLap(ms: number | null | undefined): string {
  if (!ms) return "—";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function initials(name: string): string {
  const parts = name.replace(/["()]/g, "").split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function statusLabel(status: string): string {
  return { FIN: "Terminou", DNF: "Abandono", DSQ: "Desclassificado", DNS: "Não largou" }[status] ?? status;
}
