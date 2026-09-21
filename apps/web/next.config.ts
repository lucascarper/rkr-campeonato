import type { NextConfig } from "next";

const api = apiInternalUrl(process.env.API_INTERNAL_URL);

/**
 * Endereço interno do Django. As rewrites são gravadas no build, então um valor errado aqui
 * derruba todas as chamadas /api em produção: melhor falhar o build com uma mensagem clara.
 */
function apiInternalUrl(value: string | undefined): string {
  const raw = (value ?? "").trim() || "http://127.0.0.1:8000";
  let url: URL | null = null;
  try {
    url = new URL(raw);
  } catch {
    url = null;
  }
  // "http://host:" (referência de PORT vazia) seria aceito pelo URL e cairia na porta 80.
  if (!url || !url.hostname || /:\/*$/.test(raw.replace(/^https?:\/\//, ""))) {
    throw new Error(
      `API_INTERNAL_URL inválida: "${raw}". Use http://<domínio privado da api>:<porta>, por exemplo ` +
        "http://${{rkr-api.RAILWAY_PRIVATE_DOMAIN}}:${{rkr-api.PORT}} com o nome exato do serviço " +
        "e a variável PORT definida no serviço da api.",
    );
  }
  return raw.replace(/\/+$/, "");
}
const photoHost = process.env.NEXT_PUBLIC_PHOTO_HOST; // domínio público do bucket de fotos, se houver

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Mesma origem: o navegador só fala com o Next, que repassa /api e /media ao Django pela rede privada.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/media/:path*", destination: `${api}/media/:path*` },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: photoHost ? [{ protocol: "https", hostname: photoHost }] : [],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      { source: "/admin/:path*", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};

export default nextConfig;
