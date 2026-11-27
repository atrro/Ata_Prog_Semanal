import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import type { Minute, Park } from "../../apps/web/src/lib/domain";

const accessPassword = "senha-de-teste-e2e-123";
const folderNames = [...readFileSync("database/supabase-public.sql", "utf8").split("unnest(ARRAY[")[1].split("]) WITH ORDINALITY")[0].matchAll(/'([^']+)'/g)].map(match => match[1]);
const parks: Park[] = folderNames.map((name, index) => ({ id: `folder-${index}`, name, client: "", region: "", state: "", capacity: 0, manager: "", turbines: 0 }));

function cloudMock() {
  let state: { minutes: Minute[]; parks: Park[] } = { minutes: [], parks: structuredClone(parks) };
  let revision = 1;
  return async (page: Page, options: { offline?: boolean; saveFails?: boolean } = {}) => {
    await page.route("https://windplanner-test.supabase.co/**", async route => {
      const url = route.request().url();
      const body = route.request().method() === "POST" ? route.request().postDataJSON() : null;
      if (url.includes("/rpc/wp_load_workspace")) {
        if (options.offline) { await route.fulfill({ status: 503, json: { message: "Offline" } }); return; }
        if (body.access_password !== accessPassword) { await route.fulfill({ status: 401, json: { code: "42501", message: "Invalid access password" } }); return; }
        await route.fulfill({ json: { data: state, revision } });
      } else if (url.includes("/rpc/save_wp_workspace")) {
        if (options.saveFails) { await route.fulfill({ status: 503, json: { message: "Offline" } }); return; }
        if (body.access_password !== accessPassword) { await route.fulfill({ status: 401, json: { code: "42501", message: "Invalid access password" } }); return; }
        expect(body.expected_revision).toBe(revision);
        state = body.payload; revision++;
        await route.fulfill({ json: revision });
      } else await route.fulfill({ status: 404, json: { message: "Not found" } });
    });
  };
}

async function unlock(page: Page, password = accessPassword) {
  await page.getByLabel("Senha de acesso").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

async function navigate(page: Page, name: string) {
  if (await page.getByRole("button", { name: "Abrir menu", exact: true }).isVisible()) await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name, exact: true }).click();
}

test("sem senha não consulta a nuvem nem revela atas, mesmo com dados locais no navegador", async ({ page }) => {
  const reads: string[] = [];
  page.on("request", request => { if (request.url().includes("/rpc/wp_load_workspace")) reads.push(request.url()); });
  await page.addInitScript(() => {
    sessionStorage.setItem("wind-planner-access-v1", "unlocked");
    localStorage.setItem("wind-planner-v1", JSON.stringify({ parks: [{ id: "local", name: "CONTEUDO LOCAL PRIVADO" }], minutes: [], role: "Administrador" }));
  });
  await cloudMock()(page);
  await page.goto("./");
  await expect(page.getByText("Acesso privado · senha compartilhada", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Senha de acesso")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toHaveCount(0);
  await expect(page.locator(".topbar")).toHaveCount(0);
  await expect(page.getByText("CONTEUDO LOCAL PRIVADO")).toHaveCount(0);
  expect(reads).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("senha errada mostra erro e não libera as atas", async ({ page }) => {
  await cloudMock()(page);
  await page.goto("./");
  await unlock(page, "senha-errada-123");
  await expect(page.locator("#login-error")).toContainText("Senha incorreta. Tente novamente.");
  await expect(page.locator(".topbar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toHaveCount(0);
});

test("senha correta libera as pastas, cria uma ata e a recupera em outra sessão", async ({ page, browser }) => {
  const mock = cloudMock();
  await mock(page);
  await page.goto("./");
  await unlock(page);
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nova ata", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Parque eólico *").locator("option")).toHaveCount(54);
  await dialog.getByLabel("Parque eólico *").selectOption({ label: "Vilas IV" });
  await dialog.getByLabel("Participantes *").fill("Equipe de planejamento");
  await dialog.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(page.getByText(/Atas privadas na nuvem · revisão 2/)).toBeVisible();
  const second = await browser.newContext();
  try {
    const secondPage = await second.newPage(); await mock(secondPage);
    await secondPage.goto("http://127.0.0.1:3100/Ata_Prog_Semanal/");
    await unlock(secondPage);
    await expect(secondPage.locator(".table-title")).toContainText("Vilas IV");
    await secondPage.locator(".table-title").click();
    await expect(secondPage.getByLabel("Participantes *")).toHaveValue("Equipe de planejamento");
  } finally { await second.close(); }
});

test("pasta abre histórico filtrado e permite criar ata", async ({ page }) => {
  await cloudMock()(page);
  await page.goto("./");
  await unlock(page);
  await expect(page.locator(".topbar")).toBeVisible();
  await navigate(page, "Parques eólicos");
  await expect(page.locator(".park-card")).toHaveCount(54);
  await page.locator(".park-card").filter({ has: page.getByRole("heading", { name: "Vilas IV", exact: true }) }).getByRole("button", { name: "Consultar atas" }).click();
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nova ata", exact: true }).click();
  await expect(page.getByLabel("Parque eólico *")).toHaveValue(parks[53].id);
});

test("sair remove o workspace privado da tela", async ({ page }) => {
  await cloudMock()(page);
  await page.goto("./");
  await unlock(page);
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByLabel("Senha de acesso")).toBeVisible();
  await expect(page.getByText("Acesso privado · senha compartilhada", { exact: true })).toHaveCount(0);
  await expect(page.locator(".topbar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toHaveCount(0);
});

test("falha de nuvem ao ler não libera criação nem demonstração local", async ({ page }) => {
  await cloudMock()(page, { offline: true });
  await page.goto("./");
  await unlock(page);
  await expect(page.locator("#login-error")).toContainText("Não foi possível ler a nuvem", { timeout: 20000 });
  await expect(page.locator(".topbar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toHaveCount(0);
});

test("falha de salvamento é explícita e preserva o rascunho para exportar", async ({ page }) => {
  await cloudMock()(page, { saveFails: true });
  await page.goto("./");
  await unlock(page);
  await page.getByRole("button", { name: "Nova ata", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Participantes *").fill("Equipe de planejamento");
  await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await expect(page.getByText(/Não foi possível salvar na nuvem/)).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".table-title")).toContainText("Alegria");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByText(/Existem alterações não publicadas/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
});
