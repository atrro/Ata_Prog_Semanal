import { test, expect } from "@playwright/test";

test("entrada começa bloqueada e senha incorreta não abre o workspace", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Wind Planner", exact: true })).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeDisabled();
  await page.getByLabel("Senha de acesso", { exact: true }).fill("senha-incorreta");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Senha incorreta" })).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("login.png"), fullPage: true });
});

test("senha correta entra, sessão persiste na aba e sair bloqueia novamente", async ({ page }) => {
  await page.goto("/");
  const password = page.getByLabel("Senha de acesso", { exact: true });
  await password.fill("Vestasplanejamento1");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Mostrar senha", exact: true }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar senha", exact: true }).click();
  await password.press("Enter");
  await expect(page.getByRole("heading", { name: "Cada semana, uma direção." })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Cada semana, uma direção." })).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Wind Planner", exact: true })).toBeVisible();
  await expect(page.getByLabel("Senha de acesso", { exact: true })).toHaveValue("");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Wind Planner", exact: true })).toBeVisible();
});