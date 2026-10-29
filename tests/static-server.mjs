import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = resolve("apps/web/out");
const base = "/Ata_Prog_Semanal/";
const types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain" };
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (!path.startsWith(base)) { response.writeHead(404); response.end(); return; }
    let file = resolve(root, path.slice(base.length));
    if (file !== root && !file.startsWith(`${root}${sep}`)) { response.writeHead(403); response.end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" });
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
}).listen(3100, "127.0.0.1");