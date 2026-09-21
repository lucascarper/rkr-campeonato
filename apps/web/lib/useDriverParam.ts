"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useRef } from "react";

/**
 * Estado da janela do piloto guardado na URL (?piloto=slug), só para compartilhar o link e
 * permitir fechar com o botão voltar. Não recarrega a página.
 */
export function useDriverParam() {
  const params = useSearchParams();
  const openSlug = params.get("piloto");
  const pushedRef = useRef(false);

  const write = useCallback((mutate: (url: URL) => void, mode: "push" | "replace") => {
    const url = new URL(window.location.href);
    mutate(url);
    window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
  }, []);

  const open = useCallback(
    (slug: string) => {
      pushedRef.current = true;
      write((url) => url.searchParams.set("piloto", slug), "push");
    },
    [write],
  );

  const navigate = useCallback(
    (slug: string) => write((url) => url.searchParams.set("piloto", slug), "replace"),
    [write],
  );

  const close = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      write((url) => url.searchParams.delete("piloto"), "replace");
    }
  }, [write]);

  return { openSlug, open, navigate, close, write };
}
