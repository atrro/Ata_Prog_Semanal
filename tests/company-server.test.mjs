import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createCloudServer, readConfig } from "../apps/web/server/cloud-server.mjs";

const password = "company-test-password-only";
const secret = "test-session-secret-at-least-32-characters";
const config = { origin: "https://company.example", production: true, password, secret, token: "test-token-not-real", repository: "atrro/base_de_dados" };
const initial = { revision: 0, minutes: [], parks: [{ id: "folder-1", name: "Alegria", client: "", region: "", state: "", capacity: 0, manager: "", turbines: 0 }] };
const minute = {
  id: "minute-1", parkId: "folder-1", week: 45, date: "2026-11-04", territory: "Nordeste", dispatcher: "Equipe", participants: "Equipe de planejamento", status: "Rascunho",
  checklist: [], sections: [], links: [], attachments: [], version: 1, audit: []
};

async function setup(options = {}) {
  let snapshot = structuredClone(initial);
  let sha = "sha-0";
  const calls = [];
  const githubFetch = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.headers.Authorization, `Bearer ${config.token}`);
    const path = new URL(url).pathname.split("base_de_dados")[1];
    if (options.offline) throw new Error("Disconnected");
    if (!path) return Response.json({ private: !options.publicRepo, default_branch: "main" });
    if (path === "/contents/data/workspace.json" && init.method === "PUT") {
      if (options.writeFailure) return Response.json({}, { status: options.writeFailure });
      const input = JSON.parse(init.body);
      if (input.sha !== sha) return Response.json({}, { status: 409 });
      snapshot = JSON.parse(Buffer.from(input.content, "base64").toString("utf8"));
      sha = `sha-${snapshot.revision}`;
      return Response.json({ content: { sha } });
    }
    if (path === "/contents/data/workspace.json") return Response.json({ type: "file", size: 100, sha });
    if (path === `/git/blobs/${sha}`) return Response.json({ encoding: "base64", content: Buffer.from(options.invalidData ? "{}" : JSON.stringify(snapshot)).toString("base64") });
    return Response.json({}, { status: 404 });
  };
  const server = createCloudServer(config, { githubFetch });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const call = (path, { method = "GET", cookie, data, origin: requestOrigin = config.origin } = {}) => fetch(`${origin}/cloud/${path}`, {
    method, headers: { "Content-Type": "application/json", Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}) },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {})
  });
  const login = async () => {
    const result = await call("session", { method: "POST", data: { password } });
    assert.equal(result.status, 200);
    return result.headers.get("set-cookie").split(";")[0];
  };
  return { call, login, calls, snapshot: () => snapshot, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}

test("configuração exige senha forte, segredo, token e HTTPS", () => {
  const env = { NODE_ENV: "production", APP_ORIGIN: config.origin, COMPANY_PASSWORD: password, SESSION_SECRET: secret, GITHUB_DATA_TOKEN: config.token };
  assert.equal(readConfig(env).repository, "atrro/base_de_dados");
  assert.throws(() => readConfig({ ...env, COMPANY_PASSWORD: "short" }));
  assert.throws(() => readConfig({ ...env, SESSION_SECRET: "short" }));
  assert.throws(() => readConfig({ ...env, GITHUB_DATA_TOKEN: "" }));
  assert.throws(() => readConfig({ ...env, APP_ORIGIN: "http://company.example" }));
});

test("sem senha não lê dados nem chama o GitHub", async () => {
  const app = await setup();
  try {
    assert.deepEqual(await (await app.call("session")).json(), { authenticated: false });
    assert.equal((await app.call("workspace")).status, 401);
    assert.equal((await app.call("workspace", { method: "PUT", data: {} })).status, 401);
    assert.equal(app.calls.length, 0);
  } finally { await app.close(); }
});

test("senha é validada no servidor e cookie tem proteções", async () => {
  const app = await setup();
  try {
    assert.equal((await app.call("session", { method: "POST", data: { password: "wrong" } })).status, 401);
    const response = await app.call("session", { method: "POST", data: { password } });
    const cookie = response.headers.get("set-cookie");
    assert.match(cookie, /^__Host-wp_company=/);
    assert.match(cookie, /HttpOnly; SameSite=Strict/);
    assert.match(cookie, /; Secure/);
    assert.ok(!cookie.includes(password));
    assert.equal(response.headers.get("cache-control"), "no-store");
    const authenticated = await app.call("session", { cookie: cookie.split(";")[0] });
    assert.deepEqual(await authenticated.json(), { authenticated: true });
    assert.equal((await app.call("workspace", { cookie: cookie.split(";")[0] + "tampered" })).status, 401);
    const result = await app.call("session", { method: "DELETE", cookie: cookie.split(";")[0] });
    assert.match(result.headers.get("set-cookie"), /Max-Age=0/);
  } finally { await app.close(); }
});

test("origem externa não pode fazer login ou gravação", async () => {
  const app = await setup();
  try {
    assert.equal((await app.call("session", { method: "POST", origin: "https://evil.example", data: { password } })).status, 403);
    const cookie = await app.login();
    assert.equal((await app.call("workspace", { method: "PUT", cookie, origin: "https://evil.example", data: {} })).status, 403);
    assert.equal(app.calls.length, 0);
  } finally { await app.close(); }
});

test("grava ata privada, preserva pastas e lê em outra sessão", async () => {
  const app = await setup();
  try {
    const cookie = await app.login();
    const response = await app.call("workspace", { cookie });
    const { data, revision } = await response.json();
    data.minutes.push(minute);
    const saved = await app.call("workspace", { method: "PUT", cookie, data: { expectedRevision: revision, data } });
    assert.equal(saved.status, 200);
    assert.deepEqual(await saved.json(), { revision: 1 });
    const otherCookie = await app.login();
    const recovered = await (await app.call("workspace", { cookie: otherCookie })).json();
    assert.equal(recovered.data.minutes[0].participants, minute.participants);
    assert.equal(recovered.data.parks[0].name, "Alegria");
    assert.equal(recovered.revision, 1);
    const commit = JSON.parse(app.calls.find(call => call.init.method === "PUT").init.body);
    assert.equal(commit.branch, "main");
    assert.equal(commit.sha, "sha-0");
    assert.match(commit.message, /Co-authored-by: Copilot/);
    assert.ok(!JSON.stringify(recovered).includes(config.token));
  } finally { await app.close(); }
});

test("versão antiga e conflitos GitHub não sobrescrevem dados", async () => {
  for (const status of [undefined, 409, 422]) {
    const app = await setup({ writeFailure: status });
    try {
      const cookie = await app.login();
      const response = await app.call("workspace", { method: "PUT", cookie, data: { expectedRevision: status ? 0 : 99, data: initial } });
      assert.equal(response.status, 409);
      assert.equal(app.snapshot().revision, 0);
    } finally { await app.close(); }
  }
});

test("recusa repositório público, dados inválidos e falha de rede", async () => {
  for (const options of [{ publicRepo: true }, { offline: true }, { invalidData: true }]) {
    const app = await setup(options);
    try {
      const response = await app.call("workspace", { cookie: await app.login() });
      assert.ok(response.status >= 500);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.ok(!JSON.stringify(await response.json()).includes(config.token));
    } finally { await app.close(); }
  }
});

test("valida payload e vínculo da ata à pasta", async () => {
  const app = await setup();
  try {
    const cookie = await app.login();
    for (const data of [{ minutes: null }, { ...initial, minutes: [{ ...minute, parkId: "unknown" }] }, { ...initial, parks: [initial.parks[0], initial.parks[0]] }]) {
      assert.equal((await app.call("workspace", { method: "PUT", cookie, data: { expectedRevision: 0, data } })).status, 400);
    }
    assert.equal(app.calls.length, 0);
  } finally { await app.close(); }
});

test("limita tentativas de senha", async () => {
  const app = await setup();
  try {
    for (let index = 0; index < 30; index++) assert.equal((await app.call("session", { method: "POST", data: { password: "wrong" } })).status, 401);
    assert.equal((await app.call("session", { method: "POST", data: { password } })).status, 429);
  } finally { await app.close(); }
});
