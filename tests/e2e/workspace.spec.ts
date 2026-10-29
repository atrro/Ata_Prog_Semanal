import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("wind-planner-access-v1", "unlocked"));
});

async function navigate(page: import("@playwright/test").Page, name: string) {
  await expect(page.locator(".topbar")).toBeVisible();
  if (await page.getByRole("button", { name: "Abrir menu", exact: true }).isVisible()) await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name, exact: false }).click();
}
test("painel renderiza gráficos, imagem e não transborda", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Cada semana, uma direção." })).toBeVisible();
  await expect(page.locator(".kpi-card")).toHaveCount(4);
  await expect(page.locator(".main-chart .recharts-area")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("dashboard.png"), fullPage: true });
  expect(errors).toEqual([]);
});
test("cria ata, revisa checklist, salva e persiste", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Nova ata", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Participantes/).fill("Supervisor: João\nLíder Técnico: Maria\nStock Keeper: Pedro\nPlanejador: Ana");
  await dialog.getByRole("tab", { name: "Checklist" }).click();
  await dialog.getByRole("button", { name: "Marcar todos como revisados" }).click();
  await expect(dialog.getByText("13 de 13", { exact: true })).toBeVisible();
  await dialog.getByRole("tab", { name: "Conteúdo", exact: true }).click();
  await dialog.locator(".tiptap").fill("Manutenção preventiva das turbinas 01 a 04. Revisão de materiais concluída.");
  await dialog.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByRole("status")).toContainText("Ata salva");
  await page.reload();
  await navigate(page, "Atas semanais");
  await expect(page.locator(".count-label")).toContainText("43");
});
test("filtra atas e exporta PDF", async ({ page }) => {
  await page.goto("/");
  await navigate(page, "Atas semanais");
  await page.getByLabel("Status da ata").selectOption("Rascunho");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Baixar PDF/ }).first().click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
});
test("envio exige conclusão e informa simulação", async ({ page }) => {
  await page.goto("/");
  await page.locator(".table-title").first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).last().click();
  await navigate(page, "Atas semanais");
  await page.getByLabel("Status da ata").selectOption("Enviada");
  await page.locator(".actions-menu summary").first().click();
  await page.getByRole("button", { name: "Reenviar e-mail", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Nenhuma mensagem real será enviada");
  await page.getByLabel("Destinatários", { exact: false }).fill("teste@example.com");
  await page.getByRole("button", { name: "Simular envio", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Nenhum e-mail real foi enviado");
});
test("tema persiste e perfil leitor restringe edição", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Ativar tema escuro" }).click();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.locator(".profile").click();
  await page.getByLabel("Perfil de demonstração").selectOption("Leitor");
  await navigate(page, "Atas semanais");
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toHaveCount(0);
});