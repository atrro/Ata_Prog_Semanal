import { createServer, request as proxyRequest } from "node:http";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { scrypt } from "node:crypto";
import { z } from "zod";
import { sharedStateSchema } from "../src/lib/workspace-schema.ts";

const derivePassword = promisify(scrypt);
const maxBytes = 20 * 1024 * 1024;
const snapshotSchema = sharedStateSchema.extend({ revision: z.number().int().nonnegative() });
const updateSchema = z.object({ expectedRevision: z.number().int().nonnegative(), data: sharedStateSchema });

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function readConfig(env = process.env) {
  const origin = env.APP_ORIGIN || env.RENDER_EXTERNAL_URL;
  const production = env.NODE_ENV === "production";
  if (!origin || new URL(origin).origin !== origin || (production && !origin.startsWith("https://"))) throw new Error("Configure APP_ORIGIN (HTTPS em produção) ou RENDER_EXTERNAL_URL, sem barra final.");
  if (!env.COMPANY_PASSWORD || env.COMPANY_PASSWORD.length < 12 || env.COMPANY_PASSWORD.length > 200) throw new Error("COMPANY_PASSWORD deve ter entre 12 e 200 caracteres.");
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET deve ter ao menos 32 caracteres.");
  if (!env.GITHUB_DATA_TOKEN) throw new Error("GITHUB_DATA_TOKEN não configurado.");
  const repository = env.GITHUB_DATA_REPOSITORY || "atrro/base_de_dados";
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("GITHUB_DATA_REPOSITORY inválido.");
  return { origin, production, password: env.COMPANY_PASSWORD, secret: env.SESSION_SECRET, token: env.GITHUB_DATA_TOKEN, repository };
}

export function createCloudServer(config, { githubFetch = fetch, proxyOrigin = "http://127.0.0.1:3001" } = {}) {
  const salt = randomBytes(16);
  const passwordHash = scryptSync(config.password, salt, 32);
  // Include the password in the signing key so changing it revokes existing sessions.
  const signingKey = createHmac("sha256", config.secret).update(config.password).digest();
  const cookieName = config.production ? "__Host-wp_company" : "wp_company";
  let loginWindow = { start: Date.now(), count: 0 };
  let writeWindow = { start: Date.now(), count: 0 };
  const sign = value => createHmac("sha256", signingKey).update(value).digest("base64url");
  const authenticated = request => {
    const cookies = request.headers.cookie?.split(";").map(value => value.trim()) ?? [];
    const value = cookies.find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!value || value.length > 500) return false;
    const [payload, signature, extra] = value.split(".");
    if (!payload || !signature || extra) return false;
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    try {
      const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      return Number.isSafeInteger(session.exp) && session.exp > Date.now();
    } catch { return false; }
  };
  const cookie = (value, age) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${config.production ? "; Secure" : ""}`;
  const json = (response, status, data, headers = {}) => {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
    response.end(JSON.stringify(data));
  };
  const body = async request => {
    if (!request.headers["content-type"]?.startsWith("application/json")) throw new HttpError(415, "Envie dados em JSON.");
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maxBytes) throw new HttpError(413, "Limite de 20 MB excedido. Reduza os anexos e exporte seu trabalho.");
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new HttpError(400, "JSON inválido."); }
  };
  const github = async (path, init = {}) => {
    let response;
    try {
      response = await githubFetch(`https://api.github.com/repos/${config.repository}${path}`, {
        ...init, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${config.token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...init.headers },
        signal: AbortSignal.timeout(30000)
      });
    } catch { throw new HttpError(502, "GitHub indisponível. Suas alterações não foram salvas; exporte antes de sair."); }
    if (!response.ok) {
      if ([409, 422].includes(response.status)) throw new HttpError(409, "Outra sessão alterou os dados. Exporte suas alterações e atualize antes de continuar.");
      throw new HttpError(502, "Não foi possível acessar o repositório privado. Verifique a autorização do serviço no GitHub.");
    }
    try { return await response.json(); }
    catch { throw new HttpError(502, "Resposta inválida do GitHub."); }
  };
  const readWorkspace = async () => {
    const repo = await github("");
    if (repo.private !== true) throw new HttpError(503, "Armazenamento bloqueado: o repositório de dados deve ser privado.");
    const file = await github("/contents/data/workspace.json");
    if (file.type !== "file" || typeof file.sha !== "string" || !Number.isSafeInteger(file.size) || file.size > maxBytes) throw new HttpError(502, "Arquivo de dados inválido ou maior que 20 MB.");
    const blob = await github(`/git/blobs/${file.sha}`);
    if (blob.encoding !== "base64" || typeof blob.content !== "string") throw new HttpError(502, "Conteúdo do arquivo de dados inválido.");
    let parsed;
    try { parsed = snapshotSchema.safeParse(JSON.parse(Buffer.from(blob.content, "base64").toString("utf8"))); }
    catch { throw new HttpError(502, "O arquivo de dados não contém JSON válido."); }
    if (!parsed.success) throw new HttpError(502, "Os dados armazenados não têm o formato esperado.");
    return { snapshot: parsed.data, sha: file.sha, branch: repo.default_branch };
  };

  const server = createServer(async (request, response) => {
    const path = new URL(request.url, config.origin).pathname;
    if (path === "/healthz") {
      try {
        const health = await fetch(proxyOrigin, { signal: AbortSignal.timeout(5000) });
        json(response, health.ok ? 200 : 503, { ready: health.ok });
      } catch { json(response, 503, { ready: false }); }
      return;
    }
    if (!path.startsWith("/cloud/")) {
      const headers = { ...request.headers };
      delete headers.cookie;
      const upstream = proxyRequest(new URL(request.url, proxyOrigin), { method: request.method, headers }, result => {
        response.writeHead(result.statusCode ?? 502, result.headers);
        result.pipe(response);
      });
      upstream.on("error", () => { if (!response.headersSent) json(response, 502, { error: "Interface indisponível. Tente novamente." }); else response.destroy(); });
      request.pipe(upstream);
      return;
    }
    try {
      if (!["GET", "POST", "PUT", "DELETE"].includes(request.method)) throw new HttpError(405, "Método não permitido.");
      if (request.method !== "GET" && request.headers.origin !== config.origin) throw new HttpError(403, "Origem da solicitação não autorizada.");
      if (path === "/cloud/session" && request.method === "GET") {
        json(response, 200, { authenticated: authenticated(request) }); return;
      }
      if (path === "/cloud/session" && request.method === "POST") {
        if (Date.now() - loginWindow.start > 15 * 60 * 1000) loginWindow = { start: Date.now(), count: 0 };
        if (++loginWindow.count > 30) throw new HttpError(429, "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.");
        const input = z.object({ password: z.string().min(1).max(200) }).safeParse(await body(request));
        if (!input.success) throw new HttpError(400, "Informe a senha da empresa.");
        const hash = await derivePassword(input.data.password, salt, 32);
        if (!timingSafeEqual(hash, passwordHash)) throw new HttpError(401, "Senha incorreta. Tente novamente.");
        const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000, nonce: randomBytes(16).toString("hex") })).toString("base64url");
        json(response, 200, { authenticated: true }, { "Set-Cookie": cookie(`${payload}.${sign(payload)}`, 8 * 60 * 60) }); return;
      }
      if (path === "/cloud/session" && request.method === "DELETE") {
        json(response, 200, { authenticated: false }, { "Set-Cookie": cookie("", 0) }); return;
      }
      if (!authenticated(request)) throw new HttpError(401, "Sessão inválida ou expirada. Entre novamente com a senha da empresa.");
      if (path === "/cloud/workspace" && request.method === "GET") {
        const { snapshot } = await readWorkspace();
        json(response, 200, { revision: snapshot.revision, data: { minutes: snapshot.minutes, parks: snapshot.parks } }); return;
      }
      if (path === "/cloud/workspace" && request.method === "PUT") {
        if (Date.now() - writeWindow.start > 60000) writeWindow = { start: Date.now(), count: 0 };
        if (++writeWindow.count > 60) throw new HttpError(429, "Limite de gravações atingido. Exporte suas alterações e tente novamente em um minuto.");
        const input = updateSchema.safeParse(await body(request));
        if (!input.success) throw new HttpError(400, "Dados de ata inválidos. Revise os campos e anexos.");
        const ids = new Set(input.data.data.parks.map(park => park.id));
        if (ids.size !== input.data.data.parks.length || input.data.data.minutes.some(minute => !ids.has(minute.parkId)) || new Set(input.data.data.minutes.map(minute => minute.id)).size !== input.data.data.minutes.length) throw new HttpError(400, "Atas precisam de pastas existentes e identificadores únicos.");
        const { snapshot, sha, branch } = await readWorkspace();
        if (snapshot.revision !== input.data.expectedRevision) throw new HttpError(409, "Outra sessão alterou os dados. Exporte suas alterações e atualize antes de continuar.");
        const revision = snapshot.revision + 1;
        const content = JSON.stringify({ ...input.data.data, revision });
        if (Buffer.byteLength(content) > maxBytes) throw new HttpError(413, "Limite de 20 MB excedido. Reduza os anexos.");
        await github("/contents/data/workspace.json", { method: "PUT", body: JSON.stringify({
          message: `Save company workspace revision ${revision}\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`,
          sha, branch, content: Buffer.from(content).toString("base64")
        }) });
        json(response, 200, { revision }); return;
      }
      throw new HttpError(404, "Recurso não encontrado.");
    } catch (failure) {
      const status = failure instanceof HttpError ? failure.status : 500;
      console.error(`Cloud request failed: ${request.method} ${path} (${status})`);
      json(response, status, { error: failure instanceof HttpError ? failure.message : "Falha no servidor. Nenhuma confirmação de salvamento foi recebida." });
    }
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 10000;
  return server;
}
