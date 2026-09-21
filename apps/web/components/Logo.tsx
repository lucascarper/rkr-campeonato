/* eslint-disable @next/next/no-img-element -- PNGs pequenos e já otimizados em public/brand */
import Link from "next/link";

/** Símbolo "R" oficial (ícone de carregamento, marca d'água, painel). Arquivo: public/brand/r-mark.png */
export function RMark({ className }: { className?: string }) {
  return <img src="/brand/r-mark.png" alt="" width={220} height={163} className={className} />;
}

/** Logo oficial RKR Kart Racing, fundo transparente. Arquivo: public/brand/logo.png */
export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center" aria-label="RKR Kart Racing — início">
      <img
        src="/brand/logo.png"
        alt="RKR Kart Racing"
        width={664}
        height={163}
        className="h-8 w-auto sm:h-10"
      />
    </Link>
  );
}
