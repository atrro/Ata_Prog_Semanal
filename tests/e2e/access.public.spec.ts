import { readFileSync } from "node:fs";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import type { Minute, Park } from "../../apps/web/src/lib/domain";

const admin = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const folderNames = [...readFileSync("database/supabase-public.sql", "utf8").split("unnest(ARRAY[")[1].split("]) WITH ORDINALITY")[0].matchAll(/'([^']+)'/g)].map(match => match[1]);
const parks: Park[] = folderNames.map((name, index) => ({ id: `folder-${index}`, name, client: "", region: "", state: "", capacity: 0, manager: "", turbines: 0 }));

async function authenticate(context: BrowserContext, userId = admin) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  await context.addInitScript(({ id, accessToken }) => {
    localStorage.setItem("sb-windplanner-test-auth-token", JSON.stringify({
      access_token: accessToken, refresh_token: "test-refresh", token_type: "bearer",
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id, aud: "authenticated", role: "authenticated", email: "owner@example.com", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
    }));
  }, { id: userId, accessToken: token });
}

async function navigate(page: Page, name: string) {
  if (await page.getByRole("button", { name: "Abrir menu", exact: true }).isVisible()) await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name, exact: true }).click();
}

function cloudState() {
  let state: { minutes: Minute[]; parks: Park[] } = { minutes: [], parks: structuredClone(parks) };
  let revision = 1;
  return async (page: Page, userId = admin, offline = false, saveFails = false) => {
    await page.route("https://windplanner-test.supabase.co/**", async route => {
      const url = route.request().url();
      if (url.includes("/auth/v1/logout")) { await route.fulfill({ status: 204 }); return; }
      if (url.includes("/auth/v1/user")) { await route.fulfill({ json: { id: userId, aud: "authenticated", role: "authenticated", email: "owner@example.com", app_metadata: {}, user_metadata: {} } }); return; }
      if (url.includes("/rest/v1/wp_admins")) { await route.fulfill({ json: userId === admin ? { user_id: admin } : null }); return; }
      if (userId !== admin) { await route.fulfill({ status: 403, json: { message: "Not authorized" } }); return; }
      if (url.includes("/rpc/save_wp_workspace")) {
        if (saveFails) { await route.fulfill({ status: 503, json: { message: "Offline" } }); return; }
        const input = route.request().postDataJSON();
        expect(input.expected_revision).toBe(revision);
        state = input.payload; revision++;
        await route.fulfill({ json: revision });
      } else if (url.includes("/rest/v1/wp_workspace")) {
        await route.fulfill(offline ? { status: 503, json: { message: "Offline" } } : { json: { data: state, revision } });
      } else await route.fulfill({ status: 403, json: { message: "Not authorized" } });
    });
  };
}

test("sem login não consulta a nuvem nem revela atas, mesmo contornando a antiga senha", async ({ page }) => {
  const reads: string[] = [];
  page.on("request", request => { if (request.url().includes("/rest/v1/wp_workspace")) reads.push(request.url()); });
  await page.addInitScript(() => {
    sessionStorage.setItem("wind-planner-access-v1", "unlocked");
    localStorage.setItem("wind-planner-v1", JSON.stringify({ parks: [{ id: "local", name: "CONTEUDO LOCAL PRIVADO" }], minutes: [], role: "Administrador" }));
  });
  await page.goto("./");
  await expect(page.getByText("Acesso privado · conta responsável", { exact: true })).toBeVisible();
  await expect(page.getByLabel("E-mail do responsável")).toBeVisible();
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toHaveCount(0);
  await expect(page.locator(".topbar")).toHaveCount(0);
  await expect(page.getByText("CONTEUDO LOCAL PRIVADO")).toHaveCount(0);
  expect(reads).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("outra conta autenticada não tem acesso", async ({ page, context }) => {
  await authenticate(context, other);
  await cloudState()(page, other);
  await page.goto("./");
  await expect(page.getByText("Esta conta não está autorizada a acessar as atas.", { exact: true })).toBeVisible();
  await expect(page.locator(".topbar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toHaveCount(0);
});

test("conta responsável cria uma ata na pasta e a recupera em outra sessão", async ({ page, context, browser }) => {
  const mock = cloudState();
  await authenticate(context); await mock(page);
  await page.goto("./");
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
    await authenticate(second);
    const secondPage = await second.newPage(); await mock(secondPage);
    await secondPage.goto("http://127.0.0.1:3100/Ata_Prog_Semanal/");
    await expect(secondPage.locator(".table-title")).toContainText("Vilas IV");
    await secondPage.locator(".table-title").click();
    await expect(secondPage.getByLabel("Participantes *")).toHaveValue("Equipe de planejamento");
  } finally { await second.close(); }
});

test("pasta abre histórico filtrado e permite criar ata", async ({ page, context }) => {
  await authenticate(context); await cloudState()(page);
  await page.goto("./");
  await expect(page.locator(".topbar")).toBeVisible();
  await navigate(page, "Parques eólicos");
  await expect(page.locator(".park-card")).toHaveCount(54);
  await page.locator(".park-card").filter({ has: page.getByRole("heading", { name: "Vilas IV", exact: true }) }).getByRole("button", { name: "Consultar atas" }).click();
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nova ata", exact: true }).click();
  await expect(page.getByLabel("Parque eólico *")).toHaveValue(parks[53].id);
});

test("sair remove o workspace privado da tela", async ({ page, context }) => {
  await authenticate(context); await cloudState()(page);
  await page.goto("./");
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByText("Acesso privado · conta responsável", { exact: true })).toBeVisible();
  await expect(page.locator(".topbar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toHaveCount(0);
});

test("falha de nuvem não libera criação nem demonstração local", async ({ page, context }) => {
  await authenticate(context); await cloudState()(page, admin, true);
  await page.goto("./");
  await expect(page.getByText(/Não foi possível ler a nuvem/)).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".topbar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toHaveCount(0);
});

test("falha de salvamento é explícita e preserva o rascunho para exportar", async ({ page, context }) => {
  await authenticate(context); await cloudState()(page, admin, false, true);
  await page.goto("./");
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
