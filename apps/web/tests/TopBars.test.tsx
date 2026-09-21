import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TopBars } from "@/components/TopBars";

const drivers = {
  "1": {
    id: 1,
    slug: "ed-junior",
    name: "Ed Júnior",
    nickname: "",
    number: null,
    photo: null,
    hidden: false,
  },
  "2": { id: 2, slug: "jean", name: "Jean Mazepas", nickname: "", number: null, photo: null, hidden: false },
};

describe("TopBars", () => {
  it("lista o top N na ordem da API e abre o piloto ao clicar", () => {
    Object.defineProperty(window, "matchMedia", {
      value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    });
    const onOpen = vi.fn();
    render(
      <TopBars
        entries={[
          { driver_id: 1, value: 3 },
          { driver_id: 2, value: 1 },
        ]}
        drivers={drivers}
        onOpen={onOpen}
      />,
    );
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["Ed Júnior", "Jean Mazepas"]);
    fireEvent.click(screen.getByText("Jean Mazepas"));
    expect(onOpen).toHaveBeenCalledWith("jean");
  });

  it("mostra mensagem quando não há dados", () => {
    render(<TopBars entries={[]} drivers={drivers} onOpen={() => {}} empty="Nada aqui." />);
    expect(screen.getByText("Nada aqui.")).toBeTruthy();
  });
});
