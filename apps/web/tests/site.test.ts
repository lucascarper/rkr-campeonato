import { describe, expect, it } from "vitest";

import { siteUrl } from "@/lib/site";

describe("siteUrl", () => {
  it("completa o protocolo quando a variável vem só com o domínio", () => {
    expect(siteUrl("rkr-campeonato-web-production.up.railway.app").href).toBe(
      "https://rkr-campeonato-web-production.up.railway.app/",
    );
  });

  it("mantém URLs completas", () => {
    expect(siteUrl("https://rkr.com.br").href).toBe("https://rkr.com.br/");
    expect(siteUrl("http://localhost:3000").href).toBe("http://localhost:3000/");
  });

  it("usa localhost quando vazia ou inválida", () => {
    expect(siteUrl("").href).toBe("http://localhost:3000/");
    expect(siteUrl(undefined).href).toBe("http://localhost:3000/");
    expect(siteUrl("https://exa mple").href).toBe("http://localhost:3000/");
  });
});
