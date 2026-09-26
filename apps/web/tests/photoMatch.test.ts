import { describe, expect, it } from "vitest";

import { matchDriver, normalize } from "@/lib/photoMatch";

const drivers = [
  { id: 1, name: "João Vitor Buzin", slug: "joao-vitor-buzin" },
  { id: 2, name: "Bárbara Louly", slug: "barbara-louly" },
  { id: 3, name: "Lucas Bispo Galão", slug: "lucas-bispo-galao" },
  { id: 4, name: "Luís Bispo Galão", slug: "luis-bispo-galao" },
  { id: 5, name: 'Claudir "Gaúcho" de Paula', slug: "claudir-gaucho-de-paula" },
];

describe("matchDriver", () => {
  it("casa pelo nome completo ou pelo slug", () => {
    expect(matchDriver("João Vitor Buzin.jpg", drivers)?.id).toBe(1);
    expect(matchDriver("barbara-louly.PNG", drivers)?.id).toBe(2);
  });

  it("casa por parte do nome quando só um piloto tem aquelas palavras", () => {
    expect(matchDriver("buzin.webp", drivers)?.id).toBe(1);
    expect(matchDriver("gaucho_paula.jpeg", drivers)?.id).toBe(5);
  });

  it("não chuta quando há mais de um candidato", () => {
    expect(matchDriver("galao.jpg", drivers)).toBeNull();
    expect(matchDriver("lucas galao.jpg", drivers)?.id).toBe(3);
  });

  it("ignora números e extensão", () => {
    expect(normalize("IMG 2034 Bárbara.JPG")).toBe("img 2034 barbara");
    expect(matchDriver("IMG_2034.jpg", drivers)).toBeNull();
  });
});
