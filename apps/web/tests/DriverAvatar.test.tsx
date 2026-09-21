import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DriverAvatar } from "@/components/DriverAvatar";

describe("DriverAvatar", () => {
  it("mostra as iniciais quando a foto não carrega", () => {
    render(<DriverAvatar name="João Vitor Buzin" photo="/media/drivers/x/a-thumb.webp" />);
    const img = screen.getByRole("img", { name: "João Vitor Buzin" });
    fireEvent.error(img);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("JB")).toBeTruthy();
  });
});
