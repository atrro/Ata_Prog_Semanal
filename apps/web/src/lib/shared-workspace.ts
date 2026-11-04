"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { minutesSeed, parksSeed, type Minute, type Park } from "./domain";
import { sharedStateSchema } from "./workspace-schema";
import { serverAccess, useServerWorkspace } from "./server-workspace";
export { sharedStateSchema } from "./workspace-schema";

const cloudUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cloudKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const publicAccess = ["private", "public"].includes(process.env.NEXT_PUBLIC_ACCESS_MODE ?? "") || Boolean(cloudUrl);
const cloud = cloudUrl && cloudKey ? createClient(cloudUrl, cloudKey) : null;

export function useSharedWorkspace() {
  const server = useServerWorkspace();
  const [minutes, setMinutes] = useState<Minute[]>(publicAccess ? [] : minutesSeed);
  const [parks, setParks] = useState<Park[]>(publicAccess ? [] : parksSeed);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const baseline = useRef("");
  const inFlight = useRef(false);
  const current = useRef({ minutes, parks });
  const sessionVersion = useRef(0);
  const authorizedUser = useRef<string | null>(null);
  current.current = { minutes, parks };

  const clearSession = () => {
    authorizedUser.current = null;
    baseline.current = "";
    current.current = { minutes: [], parks: [] };
    setMinutes([]); setParks([]); setRevision(0); setReady(false); setIsAdmin(false); setEmail("");
  };

  const reload = async (discard = false, version = sessionVersion.current) => {
    if (!cloud) return;
    if (!discard && baseline.current && JSON.stringify(current.current) !== baseline.current && !window.confirm("Há alterações não salvas. Recarregar e descartá-las?")) return;
    setError("");
    const result = await cloud.from("wp_workspace").select("data,revision").eq("id", "public").single();
    if (version !== sessionVersion.current) return;
    if (result.error) { setError("Não foi possível ler a nuvem. Verifique a conexão e a configuração do Supabase."); return; }
    const parsed = sharedStateSchema.safeParse(result.data.data);
    if (!parsed.success) { setError("Os dados da nuvem não têm o formato esperado. Contate o responsável."); return; }
    baseline.current = JSON.stringify(parsed.data);
    setMinutes(parsed.data.minutes);
    setParks(parsed.data.parks);
    setRevision(result.data.revision);
    setReady(true);
  };

  useEffect(() => {
    if (serverAccess) return;
    if (!publicAccess) {
      try {
        const saved = localStorage.getItem("wind-planner-v1");
        if (saved) { const parsed = sharedStateSchema.safeParse(JSON.parse(saved)); if (parsed.success) { setMinutes(parsed.data.minutes); setParks(parsed.data.parks); } }
      } catch { setError("Não foi possível restaurar os dados locais."); }
      setReady(true);
      return;
    }
    if (!cloud) { setError("Armazenamento em nuvem ainda não configurado. Nenhum dado compartilhado está disponível."); return; }
    let active = true;
    const session = async () => {
      const version = ++sessionVersion.current;
      const { data: stored, error: sessionError } = await cloud.auth.getSession();
      if (!active || version !== sessionVersion.current) return;
      if (sessionError) { clearSession(); setError("Não foi possível verificar a sessão. Tente entrar novamente."); return; }
      if (!stored.session) { clearSession(); setError(""); return; }
      const { data, error: userError } = await cloud.auth.getUser();
      if (!active || version !== sessionVersion.current) return;
      const user = data.user;
      if (userError || !user) { clearSession(); setError("Sessão inválida ou expirada. Entre novamente."); return; }
      const permission = await cloud.from("wp_admins").select("user_id").eq("user_id", user.id).maybeSingle();
      if (!active || version !== sessionVersion.current) return;
      if (permission.error || !permission.data) {
        clearSession(); setEmail(user.email ?? "");
        setError(permission.error ? "Não foi possível verificar a autorização da conta." : "Esta conta não está autorizada a acessar as atas.");
        return;
      }
      const changed = authorizedUser.current !== user.id;
      authorizedUser.current = user.id;
      setEmail(user.email ?? ""); setIsAdmin(true);
      if (changed || !baseline.current) await reload(true, version);
    };
    void session();
    const { data: subscription } = cloud.auth.onAuthStateChange(() => { setTimeout(() => { if (active) void session(); }, 0); });
    return () => { active = false; sessionVersion.current++; subscription.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (serverAccess) return;
    if (!ready) return;
    if (!publicAccess) {
      try { const saved = JSON.parse(localStorage.getItem("wind-planner-v1") ?? "{}"); localStorage.setItem("wind-planner-v1", JSON.stringify({ ...saved, minutes, parks })); }
      catch { setError("Armazenamento local cheio. Exporte seus dados e reduza os anexos."); }
      return;
    }
    if (!cloud || !isAdmin || error || saving || inFlight.current) return;
    const payload = JSON.stringify({ minutes, parks });
    if (payload === baseline.current) return;
    const timeout = setTimeout(async () => {
      const user = authorizedUser.current;
      inFlight.current = true;
      setSaving(true);
      try {
        const result = await cloud.rpc("save_wp_workspace", { expected_revision: revision, payload: JSON.parse(payload) });
        if (authorizedUser.current !== user) return;
        if (result.error) throw new Error(result.error.code === "40001" ? "Outra sessão alterou os dados. Exporte suas alterações e recarregue antes de continuar." : "Não foi possível salvar na nuvem. Suas alterações ainda não foram publicadas.");
        baseline.current = payload;
        setRevision(result.data);
      } catch (failure) { if (authorizedUser.current === user) setError(failure instanceof Error ? failure.message : "Falha ao salvar na nuvem."); }
      finally { inFlight.current = false; setSaving(false); }
    }, 500);
    return () => clearTimeout(timeout);
  }, [minutes, parks, ready, isAdmin, error, saving, revision]);

  useEffect(() => {
    if (serverAccess) return;
    if (!publicAccess) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (baseline.current && JSON.stringify(current.current) !== baseline.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  const signIn = async (address: string) => {
    if (!cloud) throw new Error("Nuvem ainda não configurada.");
    const redirect = new URL(window.location.href); redirect.hash = ""; redirect.search = "";
    const result = await cloud.auth.signInWithOtp({ email: z.email().parse(address), options: { shouldCreateUser: false, emailRedirectTo: redirect.href } });
    if (result.error) throw new Error("Não foi possível solicitar acesso. Verifique o cadastro de administrador e tente novamente.");
  };
  const signOut = async () => {
    if (baseline.current && JSON.stringify(current.current) !== baseline.current) throw new Error("Existem alterações não publicadas. Salve ou exporte antes de sair.");
    const result = await cloud?.auth.signOut();
    if (result?.error) throw new Error("Não foi possível encerrar a sessão.");
    sessionVersion.current++; clearSession(); setError("");
  };
  return serverAccess ? server : { minutes, setMinutes, parks, setParks, ready, isAdmin, email, error, saving, revision, configured: Boolean(cloud), publicAccess, reload, signIn, signOut, serverAccess: false };
}