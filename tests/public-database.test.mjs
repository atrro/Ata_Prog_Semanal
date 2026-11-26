import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";

const database = `windplanner_public_test_${randomUUID().replaceAll("-", "")}`;
const source = process.env.PUBLIC_DB_TEST_URL ?? "postgresql://windplanner:local-development-only@127.0.0.1:5432/windplanner";
const password = "senha-de-teste-123";
const newPassword = "outra-senha-teste-456";
const root = new pg.Pool({ connectionString: source, connectionTimeoutMillis: 5000 });

test("Supabase SQL: senha compartilhada, pastas e gravação auditada", async context => {
  let pool;
  const schema = await readFile("database/supabase-public.sql", "utf8");
  const expectedFolders = [...schema.split("unnest(ARRAY[")[1].split("]) WITH ORDINALITY")[0].matchAll(/'([^']+)'/g)].map(match => match[1]);
  const asRole = async (role, sql, params = []) => {
    const client = await pool.connect();
    try { await client.query(`SET ROLE ${role}`); return await client.query(sql, params); }
    finally { await client.query("RESET ROLE"); client.release(); }
  };
  const loadWorkspace = async pw => (await asRole("anon", "SELECT public.wp_load_workspace($1) AS workspace", [pw])).rows[0].workspace;
  try {
    await root.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$");
    await root.query(`CREATE DATABASE ${database}`);
    const target = new URL(source); target.pathname = `/${database}`;
    pool = new pg.Pool({ connectionString: target.href });
    await pool.query(schema);
    await pool.query("SELECT public.wp_set_access_password($1)", [password]);
    const initial = await loadWorkspace(password);
    const initialRevision = initial.revision;

    await context.test("senha fica armazenada somente como hash bcrypt", async () => {
      const stored = (await pool.query("SELECT password_hash FROM public.wp_access")).rows[0].password_hash;
      assert.match(stored, /^\$2[aby]\$12\$/);
      assert.notEqual(stored, password);
    });

    await context.test("visitante e conta autenticada não leem tabelas privadas", async () => {
      await assert.rejects(asRole("anon", "SELECT data FROM public.wp_workspace"), { code: "42501" });
      await assert.rejects(asRole("anon", "SELECT password_hash FROM public.wp_access"), { code: "42501" });
      await assert.rejects(asRole("anon", "SELECT * FROM public.wp_public_history"), { code: "42501" });
      await assert.rejects(asRole("authenticated", "SELECT data FROM public.wp_workspace"), { code: "42501" });
    });

    await context.test("senha errada ou ausente não carrega atas", async () => {
      await assert.rejects(asRole("anon", "SELECT public.wp_load_workspace($1)", ["senha-errada-123"]), { code: "42501" });
      await assert.rejects(asRole("anon", "SELECT public.wp_load_workspace(NULL)"), { code: "42501" });
    });

    await context.test("senha correta carrega exatamente as 54 pastas predefinidas", async () => {
      assert.equal(expectedFolders.length, 54);
      assert.deepEqual(initial.data.parks.map(park => park.name), expectedFolders);
      assert.equal(new Set(initial.data.parks.map(park => park.id)).size, 54);
    });

    await context.test("visitante não altera nem grava sem senha válida", async () => {
      await assert.rejects(asRole("anon", "UPDATE public.wp_workspace SET revision=999"), { code: "42501" });
      await assert.rejects(asRole("anon", "DELETE FROM public.wp_workspace"), { code: "42501" });
      await assert.rejects(asRole("anon", "SELECT public.save_wp_workspace($1,$2,$3::jsonb)", ["senha-errada-123", initialRevision, JSON.stringify(initial.data)]), { code: "42501" });
      await assert.rejects(asRole("anon", "SELECT public.save_wp_workspace(NULL,$1,$2::jsonb)", [initialRevision, JSON.stringify(initial.data)]), { code: "42501" });
      assert.equal((await loadWorkspace(password)).revision, initialRevision);
    });

    await context.test("senha não pode ser trocada nem verificada pelo navegador", async () => {
      await assert.rejects(asRole("anon", "SELECT public.wp_set_access_password($1)", [newPassword]), { code: "42501" });
      await assert.rejects(asRole("authenticated", "SELECT public.wp_set_access_password($1)", [newPassword]), { code: "42501" });
      await assert.rejects(asRole("anon", "SELECT public.wp_require_access($1)", [password]), { code: "42501" });
    });

    await context.test("gravação com senha correta cria snapshot e rejeita revisão antiga e payload inválido", async () => {
      const payload = { ...initial.data, minutes: [{ id: "ata-1", parkId: initial.data.parks[53].id }] };
      const saved = await asRole("anon", "SELECT public.save_wp_workspace($1,$2,$3::jsonb) AS revision", [password, initialRevision, JSON.stringify(payload)]);
      assert.equal(Number(saved.rows[0].revision), initialRevision + 1);
      const history = await pool.query("SELECT revision FROM public.wp_public_history ORDER BY revision");
      assert.deepEqual(history.rows.map(row => Number(row.revision)), [initialRevision + 1]);
      assert.equal((await loadWorkspace(password)).data.minutes.length, 1);
      await assert.rejects(asRole("anon", "SELECT public.save_wp_workspace($1,$2,$3::jsonb)", [password, initialRevision, JSON.stringify(payload)]), { code: "40001" });
      await assert.rejects(asRole("anon", "SELECT public.save_wp_workspace($1,$2,$3::jsonb)", [password, initialRevision + 1, '{"minutes":null,"parks":[]}']), { code: "22023" });
    });

    await context.test("histórico não é público nem alterável pela conta autenticada", async () => {
      await assert.rejects(asRole("authenticated", "DELETE FROM public.wp_public_history"), { code: "42501" });
    });

    await context.test("trocar a senha invalida a anterior e rejeita senha curta", async () => {
      await assert.rejects(pool.query("SELECT public.wp_set_access_password($1)", ["curta"]), { code: "22023" });
      await pool.query("SELECT public.wp_set_access_password($1)", [newPassword]);
      await assert.rejects(asRole("anon", "SELECT public.wp_load_workspace($1)", [password]), { code: "42501" });
      assert.equal((await loadWorkspace(newPassword)).data.minutes.length, 1);
    });

    await context.test("executar o script de novo mantém senha, atas e pastas", async () => {
      await pool.query(schema);
      const after = await loadWorkspace(newPassword);
      assert.equal(after.data.minutes.length, 1);
      assert.equal(after.data.parks.length, 54);
      assert.equal(after.revision, initialRevision + 1);
    });

    await context.test("migração remove a leitura pública da versão anterior e preserva atas", async () => {
      await pool.query("CREATE POLICY public_read ON public.wp_workspace FOR SELECT TO anon,authenticated USING(true); GRANT SELECT ON public.wp_workspace TO anon");
      await pool.query(schema);
      await assert.rejects(asRole("anon", "SELECT data FROM public.wp_workspace"), { code: "42501" });
      const policies = await pool.query("SELECT 1 FROM pg_policies WHERE tablename='wp_workspace' AND policyname='public_read'");
      assert.equal(policies.rowCount, 0);
      assert.equal((await loadWorkspace(newPassword)).data.minutes.length, 1);
    });
  } finally {
    if (pool) await pool.end();
    await root.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await root.end();
  }
});
