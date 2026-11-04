import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Senha da empresa", { exact: true }).fill("company-browser-test-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toBeVisible();
}

test("senha errada não libera dados e a antiga senha visual não contorna o servidor", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("wind-planner-access-v1", "unlocked"));
  await page.goto("/");
  await expect(page.locator(".topbar")).toHaveCount(0);
  await page.getByLabel("Senha da empresa", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Senha incorreta. Tente novamente.", { exact: true })).toBeVisible();
  await expect(page.locator(".topbar")).toHaveCount(0);
  expect((await page.request.get("/cloud/workspace")).status()).toBe(401);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("empresa cria ata e outra pessoa recupera pela mesma senha", async ({ page, browser }) => {
  await login(page);
  await page.getByRole("button", { name: "Nova ata", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Parque eólico *").locator("option")).toHaveCount(54);
  await dialog.getByLabel("Parque eólico *").selectOption({ label: "Vilas IV" });
  await dialog.getByLabel("Dispatcher responsável *").fill("Planejador da empresa");
  const participants = `Equipe compartilhada ${Date.now()}`;
  await dialog.getByLabel("Participantes *").fill(participants);
  const saved = page.waitForResponse(response => response.url().endsWith("/cloud/workspace") && response.request().method() === "PUT");
  await dialog.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByText(/Atas privadas na nuvem · revisão/)).toBeVisible();
  const context = await browser.newContext();
  try {
    const colleague = await context.newPage();
    await login(colleague);
    await colleague.locator(".table-title").filter({ hasText: "Vilas IV" }).first().click();
    await expect(colleague.getByLabel("Participantes *")).toHaveValue(participants);
  } finally { await context.close(); }
  await page.reload();
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.locator(".topbar")).toHaveCount(0);
  expect((await page.request.get("/cloud/workspace")).status()).toBe(401);
});

test("conflito preserva alterações e oferece exportação antes de atualizar", async ({ page }) => {
  await login(page);
  await page.route("**/cloud/workspace", route => route.request().method() === "PUT"
    ? route.fulfill({ status: 409, json: { error: "Outra sessão alterou os dados. Exporte suas alterações e atualize antes de continuar." } })
    : route.continue());
  await page.getByRole("button", { name: "Nova ata", exact: true }).click();
  await page.getByLabel("Participantes *").fill("Rascunho não publicado");
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(page.getByText(/Outra sessão alterou os dados/)).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByText(/Existem alterações não salvas/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
});
