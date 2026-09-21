import { expect, test } from "@playwright/test";

// Requer a api com a planilha de exemplo importada (docs/exemplos/rkr-2026-etapa-8.xlsx).

test("classificação abre a janela do piloto sem sair da lista", async ({ page }) => {
  await page.goto("/rk2");
  await expect(page.getByRole("heading", { name: /RK2/ })).toBeVisible();
  await page
    .getByRole("button", { name: /Ed Júnior/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Ed Júnior" })).toBeVisible();
  await expect(page).toHaveURL(/piloto=ed-junior/);
  await dialog.getByRole("radio", { name: /Com descarte/ }).click();
  await expect(dialog.getByText("Descartada").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/piloto=/);
});

test("seletor de etapa recalcula a tabela", async ({ page }) => {
  await page.goto("/rk1");
  await page.getByLabel("Classificação até a etapa").selectOption("4");
  await expect(page).toHaveURL(/etapa=4/);
  await expect(page.getByText("Após a etapa 4")).toBeVisible();
});

test("dashboard mostra os quatro indicadores", async ({ page }) => {
  await page.goto("/dashboard/rk3");
  for (const label of [
    "Mais voltas rápidas",
    "Mais vitórias",
    "Mais consistente",
    "Penalizações na categoria",
  ]) {
    await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
  }
});
