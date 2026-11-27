import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

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
  await expect(dialog.getByLabel(/^Participantes/)).toHaveValue(/Supervisor:/);
  await dialog.getByLabel(/^Dispatcher/).fill("ATRRO");
  await dialog.getByRole("tab", { name: "Conteúdo", exact: true }).click();
  await dialog.locator(".tiptap").fill("Manutenção preventiva das turbinas 01 a 04. Revisão de materiais concluída.");
  await dialog.getByRole("tab", { name: "Checklist" }).click();
  await dialog.getByRole("button", { name: "Marcar todos como revisados" }).click();
  await expect(dialog.getByText("13 de 13", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Salvar rascunho" }).click();
  await expect(page.getByRole("status")).toContainText("Ata salva");
  await page.reload();
  await navigate(page, "Atas semanais");
  await expect(page.locator(".count-label")).toContainText("43");
});
test("cola imagem com Ctrl+V no conteúdo da ata", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Nova ata", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Dispatcher/).fill("ATRRO");
  await dialog.getByRole("tab", { name: "Conteúdo", exact: true }).click();
  await dialog.locator(".tiptap").click();
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 40; canvas.height = 20;
    const context = canvas.getContext("2d")!; context.fillStyle = "#00a3e0"; context.fillRect(0, 0, 40, 20);
    const blob: Blob = await new Promise(resolve => canvas.toBlob(value => resolve(value!), "image/png"));
    const transfer = new DataTransfer(); transfer.items.add(new File([blob], "print.png", { type: "image/png" }));
    document.querySelector(".tiptap")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
  });
  await expect(dialog.locator(".tiptap img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await dialog.getByRole("tab", { name: "Checklist" }).click();
  await dialog.getByRole("button", { name: "Marcar todos como revisados" }).click();
  const draft = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Revisar e enviar" }).click();
  const eml = await draft;
  expect(eml.suggestedFilename()).toMatch(/\.eml$/);
  const source = readFileSync(await eml.path(), "utf8");
  expect(source).toContain("X-Unsent: 1");
  expect(source).toContain("Content-Type: multipart/related");
  expect(source).toMatch(/Content-ID: <img1@windplanner>/);
  expect(source).toMatch(/Content-Type: application\/pdf; name="ATA-Angicos/);
  await expect(page.getByRole("status")).toContainText("Rascunho do e-mail criado");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Baixar PDF/ }).first().click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  await expect(page.getByRole("status").filter({ hasText: "Não foi possível gerar o PDF." })).toHaveCount(0);
});
test("exporta a ata em HTML com todas as informações", async ({ page }) => {
  await page.goto("/");
  await navigate(page, "Atas semanais");
  await page.locator(".actions-menu summary").first().click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar HTML", exact: true }).first().click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.html$/);
  const html = readFileSync(await file.path(), "utf8");
  expect(html).toContain("ATA DE PROGRAMAÇÃO SEMANAL");
  expect(html).toContain("Participantes");
  expect(html).toContain("Checklist de verificação");
  expect(html).toContain("#004484");
});
test("inicia nova ata a partir da última ata do parque", async ({ page }) => {
  await page.goto("/");
  await navigate(page, "Atas semanais");
  const first = await page.locator(".table-title").first().innerText();
  await page.getByRole("button", { name: "Nova ata", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const parkName = first.split("\n")[0].trim();
  await dialog.getByLabel("Parque eólico *").selectOption({ label: parkName });
  await dialog.getByLabel(/^Participantes/).fill("Participantes antigos");
  await dialog.getByRole("button", { name: "Iniciar a partir da última ata" }).click();
  await expect(dialog.getByLabel(/^Participantes/)).toHaveValue(/Supervisor: Ricardo Almeida/);
  await expect(dialog.getByLabel(/^Dispatcher/)).not.toHaveValue("");
});
test("lista parques em tabela e não em cartões", async ({ page }) => {
  await page.goto("/");
  await navigate(page, "Parques eólicos");
  await expect(page.locator(".park-card")).toHaveCount(0);
  await expect(page.locator(".parks-table tbody tr")).toHaveCount(54);
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
  await expect(page.getByRole("dialog")).toContainText("Abre um rascunho no Outlook");
  await page.getByLabel("Destinatários", { exact: false }).fill("teste@example.com");
  await page.getByRole("button", { name: "Registrar envio", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Envio registrado para teste@example.com");
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