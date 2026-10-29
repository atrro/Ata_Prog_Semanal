"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { minutesSeed, parksSeed, type Minute, type Park } from "./domain";

const parkSchema = z.object({ id: z.string().min(1), name: z.string(), client: z.string(), region: z.string(), state: z.string(), capacity: z.number(), manager: z.string(), turbines: z.number() });
const minuteSchema = z.object({
  id: z.string().min(1), parkId: z.string(), week: z.number().int().min(1).max(53), date: z.string(), territory: z.string(), dispatcher: z.string(), participants: z.string(),
  status: z.enum(["Enviada", "Pendente", "Rascunho"]), checklist: z.array(z.string()),
  sections: z.array(z.object({ title: z.string(), content: z.string() })),
  links: z.array(z.object({ title: z.string(), url: z.url().refine(value => /^https?:\/\//i.test(value)) })),
  attachments: z.array(z.object({ id: z.string(), name: z.string(), size: z.number(), type: z.string(), data: z.string().refine(value => /^data:(application\/(pdf|vnd\.[a-z0-9.+-]+)|text\/csv|image\/(png|jpeg));base64,/i.test(value)), version: z.number() })),
  version: z.number(), audit: z.array(z.object({ version: z.number(), actor: z.string(), date: z.string(), action: z.string() })), sentAt: z.string().optional()
});
export const sharedStateSchema = z.object({ minutes: z.array(minuteSchema), parks: z.array(parkSchema) });

const cloudUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cloudKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const publicAccess = process.env.NEXT_PUBLIC_ACCESS_MODE === "public" || Boolean(cloudUrl);
const cloud = cloudUrl && cloudKey ? createClient(cloudUrl, cloudKey) : null;

export function useSharedWorkspace() {
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
  current.current = { minutes, parks };

  const reload = async (discard = false) => {
    if (!cloud) return;
    if (!discard && baseline.current && JSON.stringify(current.current) !== baseline.current && !window.confirm("Há alterações não salvas. Recarregar e descartá-las?")) return;
    setError("");
    const result = await cloud.from("wp_workspace").select("data,revision").eq("id", "public").single();
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
      const { data } = await cloud.auth.getSession();
      const user = data.session?.user;
      if (!user) { if (active) { setIsAdmin(false); setEmail(""); } return; }
      const permission = await cloud.from("wp_admins").select("user_id").eq("user_id", user.id).maybeSingle();
      if (active) { setEmail(user.email ?? ""); setIsAdmin(Boolean(permission.data)); }
    };
    void reload(true);
    void session();
    const { data: subscription } = cloud.auth.onAuthStateChange(() => { setTimeout(() => { if (active) void session(); }, 0); });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
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
      inFlight.current = true;
      setSaving(true);
      try {
        const result = await cloud.rpc("save_wp_workspace", { expected_revision: revision, payload: JSON.parse(payload) });
        if (result.error) throw new Error(result.error.code === "40001" ? "Outra sessão alterou os dados. Exporte suas alterações e recarregue antes de continuar." : "Não foi possível salvar na nuvem. Suas alterações ainda não foram publicadas.");
        baseline.current = payload;
        setRevision(result.data);
      } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao salvar na nuvem."); }
      finally { inFlight.current = false; setSaving(false); }
    }, 500);
    return () => clearTimeout(timeout);
  }, [minutes, parks, ready, isAdmin, error, saving, revision]);

  useEffect(() => {
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
  };
  return { minutes, setMinutes, parks, setParks, ready, isAdmin, email, error, saving, revision, configured: Boolean(cloud), publicAccess, reload, signIn, signOut };
}