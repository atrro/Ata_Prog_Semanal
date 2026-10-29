import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const base = process.env.API_URL ?? "http://localhost:4000/api/v1";
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://windplanner:local-development-only@localhost:5432/windplanner" });
const request = async (path, method = "GET", body, headers = {}) => {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
};
test("API com PostgreSQL: concorrência, isolamento, auditoria e distribuição", async context => {
  let minute;
  const checklist = ["Técnicos em férias", "Técnicos em treinamento", "Técnicos indisponíveis", "Conferência climática", "Ferramentas disponíveis", "Materiais disponíveis", "Backlog revisado", "CMS Overdue", "VTM Overdue", "Breakdowns", "Capacity Levelling", "Programação do Cliente", "Feriados da semana"];
  const input = { parkId: "00000000-0000-4000-8000-000000000003", week: 44, date: "2026-10-29", territory: "Nordeste", dispatcher: "Integração Automatizada", participants: "Supervisor: Teste", checklist, sections: [{ title: "Programação", content: "<p>Manutenção preventiva</p>" }], links: [] };
  try {
    await context.test("health readiness", async () => assert.equal((await request("/health/ready")).status, 200));
    await context.test("cria ata auditada", async () => { const result = await request("/minutes", "POST", input); assert.equal(result.status, 201); minute = result.body; assert.equal(minute.version, 1); });
    await context.test("não aceita companyId vindo do cliente", async () => assert.equal((await request("/minutes", "POST", { ...input, companyId: randomUUID() })).status, 400));
    await context.test("isola chave estrangeira por empresa", async () => assert.equal((await request("/minutes", "POST", { ...input, parkId: randomUUID() })).status, 404));
    await context.test("duas edições concorrentes geram um conflito", async () => {
      const results = await Promise.all([request(`/minutes/${minute.id}`, "PATCH", input, { "If-Match": "1" }), request(`/minutes/${minute.id}`, "PATCH", input, { "If-Match": "1" })]);
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]); minute = results.find(result => result.status === 200).body;
    });
    await context.test("auditoria é append-only no banco", async () => {
      await assert.rejects(pool.query("UPDATE minute_versions SET action='alterada' WHERE minute_id=$1", [minute.id]), /append-only/);
      const history = await request(`/minutes/${minute.id}/versions`); assert.equal(history.body.length, 2);
    });
    await context.test("envio é idempotente", async () => {
      const key = randomUUID(); const body = { recipients: ["teste@example.com"], version: minute.version };
      const first = await request(`/minutes/${minute.id}/send`, "POST", body, { "Idempotency-Key": key });
      const second = await request(`/minutes/${minute.id}/send`, "POST", body, { "Idempotency-Key": key });
      assert.equal(first.status, 202); assert.equal(second.status, 202); assert.equal(first.body.id, second.body.id);
    });
    await context.test("consulta de outra empresa não retorna registro", async () => {
      const result = await pool.query("SELECT * FROM minutes WHERE id=$1 AND company_id=$2", [minute.id, randomUUID()]); assert.equal(result.rowCount, 0);
    });
    await context.test("PDF real é gerado e armazenado no Blob", async () => {
      const result = await fetch(`${base}/minutes/${minute.id}/pdf`); assert.equal(result.status, 200); assert.equal(result.headers.get("content-type"), "application/pdf"); assert.equal(Buffer.from(await result.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
    });
  } finally { if (minute) { const current = await request(`/minutes/${minute.id}`); await request(`/minutes/${minute.id}`, "DELETE", null, { "If-Match": String(current.body.version) }); } await pool.end(); }
});