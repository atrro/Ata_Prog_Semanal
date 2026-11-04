import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createCloudServer } from "../apps/web/server/cloud-server.mjs";

const names = [...readFileSync("database/supabase-public.sql", "utf8").split("unnest(ARRAY[")[1].split("]) WITH ORDINALITY")[0].matchAll(/'([^']+)'/g)].map(match => match[1]);
let snapshot = {
  revision: 0, minutes: [],
  parks: names.map((name, index) => ({ id: `folder-${index + 1}`, name, client: "", region: "", state: "", capacity: 0, manager: "", turbines: 0 }))
};
let sha = "sha-0";
const githubFetch = async (url, init) => {
  const path = new URL(url).pathname.split("base_de_dados")[1];
  if (!path) return Response.json({ private: true, default_branch: "main" });
  if (path === "/contents/data/workspace.json" && init.method === "PUT") {
    const input = JSON.parse(init.body);
    if (input.sha !== sha) return Response.json({}, { status: 409 });
    snapshot = JSON.parse(Buffer.from(input.content, "base64").toString("utf8"));
    sha = `sha-${snapshot.revision}`;
    return Response.json({ content: { sha } });
  }
  if (path === "/contents/data/workspace.json") return Response.json({ type: "file", size: Buffer.byteLength(JSON.stringify(snapshot)), sha });
  if (path === `/git/blobs/${sha}`) return Response.json({ encoding: "base64", content: Buffer.from(JSON.stringify(snapshot)).toString("base64") });
  return Response.json({}, { status: 404 });
};
const child = spawn(process.execPath, ["apps/web/.next/standalone/apps/web/server.js"], { stdio: "inherit", env: { ...process.env, PORT: "3301", HOSTNAME: "127.0.0.1" } });
const server = createCloudServer({
  origin: "http://127.0.0.1:3300", production: false, password: "company-browser-test-password",
  secret: "company-browser-test-secret-32-characters", token: "mock-token", repository: "atrro/base_de_dados"
}, { githubFetch, proxyOrigin: "http://127.0.0.1:3301" });
server.listen(3300, "127.0.0.1");
const stop = () => { server.close(); child.kill("SIGTERM"); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", code => { server.close(); process.exitCode = code ?? 1; });
