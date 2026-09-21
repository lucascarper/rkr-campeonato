import { describe, expect, it } from "vitest";

import { parseCategory } from "@/lib/categories";
import { formatDate, formatLap, formatPoints, initials, statusLabel } from "@/lib/format";

describe("formatação", () => {
  it("formata pontos em pt-BR", () => {
    expect(formatPoints(136)).toBe("136");
    expect(formatPoints(12.5)).toBe("12,5");
    expect(formatPoints(null)).toBe("—");
  });

  it("formata tempo de volta a partir de milissegundos", () => {
    expect(formatLap(41235)).toBe("0:41.235");
    expect(formatLap(62500)).toBe("1:02.500");
    expect(formatLap(null)).toBe("—");
  });

  it("formata data sem virar o dia no fuso de São Paulo", () => {
    expect(formatDate("2026-09-12")).toMatch(/^12 set/);
  });

  it("gera iniciais ignorando aspas e parênteses", () => {
    expect(initials('Claudir "Gaúcho" de Paula')).toBe("CP");
    expect(initials("Pedro Oliveira (Pedrovisk)")).toBe("PP");
  });

  it("traduz o status do resultado", () => {
    expect(statusLabel("DSQ")).toBe("Desclassificado");
  });

  it("aceita só RK1, RK2 e RK3", () => {
    expect(parseCategory("rk2")).toBe("RK2");
    expect(parseCategory("rk9")).toBeNull();
  });
});
