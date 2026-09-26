"use client";

import { useEffect, useRef, useState } from "react";

import { formatPoints } from "@/lib/format";
import { useReducedMotion } from "@/lib/motion";

/**
 * Número que conta do valor anterior até o novo quando muda (ex.: pontos ao trocar a etapa).
 * Escreve direto no DOM a cada quadro, sem re-renderizar a tabela inteira.
 */
export function Ticker({
  value,
  duration = 650,
  format = formatPoints,
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  // O React escreve só o texto inicial; depois o número é atualizado apenas pelo efeito abaixo.
  // Se o React também atualizasse o texto, os dois disputariam o mesmo nó.
  const [initial] = useState(() => format(value));
  const reduced = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    const from = shown.current;
    if (!node || from === value) return;
    if (reduced) {
      shown.current = value;
      node.textContent = format(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (value - from) * eased;
      shown.current = current;
      node.textContent = format(t === 1 ? value : Math.round(current));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // Garantia: com a aba em segundo plano o navegador pausa os quadros; o valor final entra mesmo assim.
    const done = window.setTimeout(() => {
      shown.current = value;
      node.textContent = format(value);
    }, duration + 80);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(done);
    };
  }, [value, duration, format, reduced]);

  return (
    <span ref={ref} className={className} aria-label={format(value)}>
      {initial}
    </span>
  );
}
