import { test, expect, type Page } from "@playwright/test";
import { minutesSeed, parksSeed } from "../../apps/web/src/lib/domain";

async function publicCloud(page: Page) {
  await page.route("https://windplanner-test.supabase.co/**", async route => {
    if (route.request().url().includes("/rest/v1/wp_workspace")) await route.fulfill({ json: { data: { minutes: minutesSeed, parks: parksSeed }, revision: 3 } });
    else await route.fulfill({ status: 403, json: { message: "Not authorized" } });
  });
}
test("consulta compartilhada abre sem cadastro e ignora dados locais", async ({ page }) => {
  await publicCloud(page);
  await page.addInitScript(() => { localStorage.setItem("wind-planner-v1", JSON.stringify({ parks: [{ id: "local-only", name: "CONTEUDO LOCAL PRIVADO" }], minutes: [], role: "Administrador" })); });
  await page.goto("./");
  await expect(page.getByText("Consulta pública · sem cadastro", { exact: true })).toBeVisible();
  await expect(page.getByText(/Dados compartilhados na nuvem · revisão 3/)).toBeVisible();
  await expect(page.locator(".table-title")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toHaveCount(0);
  await expect(page.getByText("CONTEUDO LOCAL PRIVADO")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("visitante pode visualizar e baixar, sem editar ou excluir", async ({ page }) => {
  await publicCloud(page);
  await page.goto("./");
  await page.locator(".table-title").first().click();
  await expect(page.getByRole("button", { name: "Salvar rascunho" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Revisar e enviar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Exportar PDF" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).last().click();
  await page.locator(".actions-menu summary").first().click();
  await expect(page.getByRole("button", { name: "Editar ata", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Excluir ata", exact: true })).toHaveCount(0);
});
test("falha de nuvem não usa demonstração local como se fosse compartilhada", async ({ page }) => {
  await page.route("https://windplanner-test.supabase.co/**", route => route.fulfill({ status: 503, json: { message: "Offline" } }));
  await page.goto("./");
  await expect(page.getByText(/Não foi possível ler a nuvem/)).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".table-title")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nova ata", exact: true })).toHaveCount(0);
});

test("responsável autorizado publica e outro navegador recebe os mesmos dados", async ({ page, context, browser }) => {
  const admin = "00000000-0000-4000-8000-000000000001";
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: admin, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  await context.addInitScript(({ adminId, accessToken }) => {
    localStorage.setItem("sb-windplanner-test-auth-token", JSON.stringify({ access_token: accessToken, refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: adminId, aud: "authenticated", role: "authenticated", email: "admin@example.com", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }));
  }, { adminId: admin, accessToken: token });
  let state = { minutes: structuredClone(minutesSeed), parks: structuredClone(parksSeed) };
  let revision = 3;
  const mock = async (target: Page) => target.route("https://windplanner-test.supabase.co/**", async route => {
    const url = route.request().url();
    if (url.includes("/rest/v1/wp_admins")) await route.fulfill({ json: { user_id: admin } });
    else if (url.includes("/rpc/save_wp_workspace")) { const input = route.request().postDataJSON(); expect(input.expected_revision).toBe(revision); state = input.payload; revision++; await route.fulfill({ json: revision }); }
    else if (url.includes("/rest/v1/wp_workspace")) await route.fulfill({ json: { data: state, revision } });
    else await route.fulfill({ json: { id: admin, email: "admin@example.com" } });
  });
  await mock(page);
  await page.goto("./");
  await expect(page.getByText("Administração da publicação", { exact: true })).toBeVisible();
  if (await page.getByRole("button", { name: "Abrir menu", exact: true }).isVisible()) await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Parques eólicos", exact: true }).click();
  await page.getByRole("button", { name: "Novo parque", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome do parque *", { exact: true }).fill("Parque Publicado Teste");
  await dialog.getByLabel("Cliente *", { exact: true }).fill("Cliente Teste");
  await dialog.getByLabel("Estado *", { exact: true }).fill("RN");
  await dialog.getByLabel("Capacidade instalada (MW) *", { exact: true }).fill("100");
  await dialog.getByLabel("Aerogeradores *", { exact: true }).fill("25");
  await dialog.getByLabel("Gestor responsável *", { exact: true }).fill("Gestor Teste");
  await dialog.getByRole("button", { name: "Salvar parque", exact: true }).click();
  await expect(page.getByText(/Dados compartilhados na nuvem · revisão 4/)).toBeVisible();
  const visitor = await browser.newContext();
  try {
    const publicPage = await visitor.newPage(); await mock(publicPage);
    await publicPage.goto("http://127.0.0.1:3100/Ata_Prog_Semanal/");
    await expect(publicPage.getByText(/Dados compartilhados na nuvem · revisão 4/)).toBeVisible();
    if (await publicPage.getByRole("button", { name: "Abrir menu", exact: true }).isVisible()) await publicPage.getByRole("button", { name: "Abrir menu", exact: true }).click();
    await publicPage.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Parques eólicos", exact: true }).click();
    await expect(publicPage.getByRole("heading", { name: "Parque Publicado Teste", exact: true })).toBeVisible();
    await expect(publicPage.getByRole("button", { name: "Novo parque", exact: true })).toHaveCount(0);
  } finally { await visitor.close(); }
});