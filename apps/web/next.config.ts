import type { NextConfig } from "next";

const api = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";
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
