import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";

const database = `windplanner_public_test_${randomUUID().replaceAll("-", "")}`;
const source = process.env.PUBLIC_DB_TEST_URL ?? "postgresql://windplanner:local-development-only@127.0.0.1:5432/windplanner";
const root = new pg.Pool({ connectionString: source, connectionTimeoutMillis: 5000 });
test("Supabase SQL: atas privadas, pastas e uma única conta responsável", async context => {
  let pool;
  const admin = "00000000-0000-4000-8000-000000000001";
  const other = "00000000-0000-4000-8000-000000000002";
  const withRole = async (role, user, action) => {
    const client = await pool.connect();
    try { await client.query("BEGIN"); await client.query(`SET LOCAL ROLE ${role}`); await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user ?? ""]); const result = await action(client); await client.query("ROLLBACK"); return result; } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  };
  try {
    await root.query("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$");
    await root.query(`CREATE DATABASE ${database}`);
    const target = new URL(source); target.pathname = `/${database}`;
    pool = new pg.Pool({ connectionString: target.href });
    await pool.query("CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; GRANT USAGE ON SCHEMA public,auth TO anon,authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated");
    await pool.query(await readFile("database/supabase-public.sql", "utf8"));
    await pool.query("INSERT INTO auth.users(id) VALUES($1),($2)", [admin, other]);
    await pool.query("INSERT INTO public.wp_admins(user_id) VALUES($1)", [admin]);
    const initialRevision = Number((await pool.query("SELECT revision FROM public.wp_workspace")).rows[0].revision);
    const payload = JSON.stringify((await pool.query("SELECT data FROM public.wp_workspace")).rows[0].data);
    await context.test("visitante não lê atas nem anexos", async () => {
      await assert.rejects(withRole("anon", null, client => client.query("SELECT data FROM public.wp_workspace")), { code: "42501" });
    });
    await context.test("conta não autorizada não lê registros ou histórico", async () => {
      const result = await withRole("authenticated", other, client => client.query("SELECT data FROM public.wp_workspace"));
      assert.equal(result.rowCount, 0);
      const history = await withRole("authenticated", other, client => client.query("SELECT data FROM public.wp_public_history"));
      assert.equal(history.rowCount, 0);
    });
    await context.test("somente uma conta pode ser responsável", async () => {
      await assert.rejects(pool.query("INSERT INTO public.wp_admins(user_id) VALUES($1)", [other]), { code: "23505" });
    });
    await context.test("responsável lê exatamente as 54 pastas predefinidas", async () => {
      const result = await withRole("authenticated", admin, client => client.query("SELECT data FROM public.wp_workspace"));
      const expected = ["Alegria", "Amontada", "Angicos", "Aroeira", "Assuruá", "Aventura", "Babilônia Centro", "Babilônia Sul CDV", "Cabeço Preto", "Caldeirão", "Campo Largo", "Catanduba", "CGN", "Copel", "Cumaru", "DELFINA", "Dom Inocêncio", "Elera", "Esquina do Vento", "Folha Larga CDV", "Folha Larga Norte", "Gargaú", "Gravatá", "Honda", "Icaraí", "Jerusalém", "Kairós", "Macambira", "Monte verde", "Morro do Chapeu I", "Morro do Chapeu II", "Mundo Novo", "Novo Horizonte", "Ouro Branco", "Pedra do Reino", "Pedra Pintada", "Pedra Rajada", "Riachão", "Rio do Vento Expansão", "Rio do Vento II", "Santa Rosa Mundo Novo", "Sento Sé", "Seridó", "Serra das Almas", "Serra das Vacas", "Serra do Assuruá", "Serra do Tigre", "Serrote e Serra do Mato", "Taiba", "Umari", "Ventos da Bahia", "Ventos do Piauí", "Vilas", "Vilas IV"];
      assert.deepEqual(result.rows[0].data.parks.map(park => park.name), expected);
      assert.equal(new Set(result.rows[0].data.parks.map(park => park.id)).size, 54);
    });
    await context.test("visitante não altera nem exclui", async () => {
      await assert.rejects(withRole("anon", null, client => client.query("UPDATE public.wp_workspace SET revision=999")), { code: "42501" });
      await assert.rejects(withRole("anon", null, client => client.query("DELETE FROM public.wp_workspace")), { code: "42501" });
    });
    await context.test("visitante não chama função de gravação", async () => { await assert.rejects(withRole("anon", null, client => client.query("SELECT public.save_wp_workspace(0,'{\"minutes\":[],\"parks\":[]}')")), { code: "42501" }); });
    await context.test("usuário autenticado sem permissão não grava nem promove a si mesmo", async () => {
      await assert.rejects(withRole("authenticated", other, client => client.query("SELECT public.save_wp_workspace(0,'{\"minutes\":[],\"parks\":[]}')")), { code: "42501" });
      await assert.rejects(withRole("authenticated", other, client => client.query("INSERT INTO public.wp_admins(user_id) VALUES($1)", [other])), { code: "42501" });
    });
    await context.test("administrador grava com snapshot auditado", async () => { await withRole("authenticated", admin, async client => { const saved = await client.query("SELECT public.save_wp_workspace($1,$2) AS revision", [initialRevision, payload]); assert.equal(Number(saved.rows[0].revision), initialRevision + 1); const history = await client.query("SELECT actor_id FROM public.wp_public_history"); assert.equal(history.rows[0].actor_id, admin); }); });
    await context.test("versão antiga é rejeitada", async () => { await assert.rejects(withRole("authenticated", admin, client => client.query("SELECT public.save_wp_workspace(99,'{\"minutes\":[],\"parks\":[]}')")), { code: "40001" }); });
    await context.test("payload inválido é rejeitado", async () => { await assert.rejects(withRole("authenticated", admin, client => client.query("SELECT public.save_wp_workspace(0,'{\"minutes\":null}')")), { code: "22023" }); });
    await context.test("histórico não é público nem alterável pelo administrador", async () => {
      await assert.rejects(withRole("anon", null, client => client.query("SELECT * FROM public.wp_public_history")), { code: "42501" });
      await assert.rejects(withRole("authenticated", admin, client => client.query("DELETE FROM public.wp_public_history")), { code: "42501" });
    });
    await context.test("migração remove leitura pública, preserva atas e não duplica pastas", async () => {
      await pool.query("CREATE POLICY public_read ON public.wp_workspace FOR SELECT TO anon,authenticated USING(true); GRANT SELECT ON public.wp_workspace TO anon");
      await pool.query(`UPDATE public.wp_workspace SET data=jsonb_set(data,'{minutes}','[{"id":"preserved","parkId":"existing"}]')`);
      await pool.query(await readFile("database/supabase-public.sql", "utf8"));
      await assert.rejects(withRole("anon", null, client => client.query("SELECT data FROM public.wp_workspace")), { code: "42501" });
      const result = await pool.query("SELECT data,revision FROM public.wp_workspace");
      assert.equal(result.rows[0].data.minutes[0].id, "preserved");
      assert.equal(result.rows[0].data.parks.length, 54);
      assert.equal(Number(result.rows[0].revision), initialRevision);
    });
  } finally { if (pool) await pool.end(); await root.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`); await root.end(); }
});