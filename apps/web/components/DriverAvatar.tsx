"use client";

import clsx from "clsx";
import { useState } from "react";

import { initials } from "@/lib/format";

/** Miniatura do piloto; sem foto (ou se ela não carregar), mostra as iniciais sobre um traço vermelho. */
export function DriverAvatar({
  name,
  photo,
  size = 32,
  className,
}: {
  name: string;
  photo: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = photo && failed !== photo;
  return (
    <span
      className={clsx(
        "cut-sm relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-surface-2",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {showPhoto ? (
        // Fotos já chegam recortadas em WebP pelo backend (Pillow), por isso <img> simples.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(photo)}
          className="h-full w-full object-cover"
        />
      ) : (
        <>
          <span aria-hidden className="absolute -right-1 top-0 h-full w-1.5 skew-x-[-12deg] bg-red/70" />
          <span
            className="display relative text-[0.8em] font-bold text-muted"
            style={{ fontSize: size * 0.42 }}
          >
            {initials(name)}
          </span>
        </>
      )}
    </span>
  );
}
