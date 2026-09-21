/**
 * URL pública do site a partir de NEXT_PUBLIC_SITE_URL, tolerante a valores sem protocolo
 * (ex.: "rkr.up.railway.app" vira "https://rkr.up.railway.app"). Valor vazio ou inválido cai no localhost.
 */
export function siteUrl(value = process.env.NEXT_PUBLIC_SITE_URL): URL {
  const raw = (value ?? "").trim();
  if (!raw) return new URL("http://localhost:3000");
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme);
  } catch {
    return new URL("http://localhost:3000");
  }
}
