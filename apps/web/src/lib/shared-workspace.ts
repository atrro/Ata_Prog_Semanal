"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { minutesSeed, parksSeed, type Minute } from "./domain";
import { sharedStateSchema } from "./workspace-schema";
export { sharedStateSchema } from "./workspace-schema";

const cloudUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cloudKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const publicAccess = ["private", "public"].includes(process.env.NEXT_PUBLIC_ACCESS_MODE ?? "") || Boolean(cloudUrl);
const cloud = cloudUrl && cloudKey ? createClient(cloudUrl, cloudKey) : null;

export function useSharedWorkspace() {
  const [minutes, setMinutes] = useState<Minute[]>(publicAccess ? [] : minutesSeed);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const baseline = useRef("");
  const inFlight = useRef(false);
  const current = useRef({ minutes });
  const accessPassword = useRef("");
  current.current = { minutes };
  const fetchWorkspace = async (password: string) => {
    if (!cloud) throw new Error("Armazenamento em nuvem ainda não configurado. Nenhum dado compartilhado está disponível.");
    const result = await cloud.rpc("wp_load_workspace", { access_password: password });
    if (result.error) throw new Error(result.error.code === "42501" ? "Senha incorreta. Tente novamente." : "Não foi possível ler a nuvem. Verifique a conexão e a configuração do Supabase.");
    const parsed = sharedStateSchema.safeParse(result.data.data);
    if (!parsed.success) throw new Error("Os dados da nuvem não têm o formato esperado. Contate o responsável.");
    baseline.current = JSON.stringify({ minutes: parsed.data.minutes, parks: parksSeed });
    setMinutes(parsed.data.minutes);
    setRevision(result.data.revision);
    setReady(true);
  };

  useEffect(() => {
    if (!publicAccess) {
      try {
        const saved = localStorage.getItem("wind-planner-v1");
        if (saved) { const parsed = sharedStateSchema.safeParse(JSON.parse(saved)); if (parsed.success) { setMinutes(parsed.data.minutes); } }
      } catch { setError("Não foi possível restaurar os dados locais."); }
      setReady(true);
      return;
    }
    if (!cloud) setError("Armazenamento em nuvem ainda não configurado. Nenhum dado compartilhado está disponível.");
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!publicAccess) {
      try { const saved = JSON.parse(localStorage.getItem("wind-planner-v1") ?? "{}"); localStorage.setItem("wind-planner-v1", JSON.stringify({ ...saved, minutes })); }
      catch { setError("Armazenamento local cheio. Exporte seus dados e reduza os anexos."); }
      return;
    }
    if (!cloud || error || saving || inFlight.current) return;
    const payload = JSON.stringify({ minutes, parks: parksSeed });
    if (payload === baseline.current) return;
    const timeout = setTimeout(async () => {
      inFlight.current = true;
      setSaving(true);
      try {
        const result = await cloud.rpc("save_wp_workspace", { access_password: accessPassword.current, expected_revision: revision, payload: JSON.parse(payload) });
        if (result.error) throw new Error(result.error.code === "40001" ? "Outra sessão alterou os dados. Exporte suas alterações e recarregue antes de continuar." : result.error.code === "42501" ? "Senha de acesso inválida. Saia e entre novamente." : "Não foi possível salvar na nuvem. Suas alterações ainda não foram publicadas.");
        baseline.current = payload;
        setRevision(result.data);
      } catch (failure) { setError(failure instanceof Error ? failure.message : "Falha ao salvar na nuvem."); }
      finally { inFlight.current = false; setSaving(false); }
    }, 500);
    return () => clearTimeout(timeout);
  }, [minutes, ready, error, saving, revision]);

  useEffect(() => {
    if (!publicAccess) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { if (baseline.current && JSON.stringify({ minutes: current.current.minutes, parks: parksSeed }) !== baseline.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  const hasUnsavedChanges = () => Boolean(baseline.current) && JSON.stringify({ minutes: current.current.minutes, parks: parksSeed }) !== baseline.current;
  const reload = async () => {
    if (hasUnsavedChanges() && !window.confirm("Há alterações não salvas. Recarregar e descartá-las?")) return;
    setError("");
    try { await fetchWorkspace(accessPassword.current); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível ler a nuvem."); }
  };
  const unlock = async (password: string) => {
    await fetchWorkspace(password);
    accessPassword.current = password;
    setError("");
  };
  const lock = () => {
    if (hasUnsavedChanges()) throw new Error("Existem alterações não publicadas. Salve ou exporte antes de sair.");
    accessPassword.current = "";
    baseline.current = "";
    current.current = { minutes: [] };
    setMinutes([]); setRevision(0); setReady(false); setError("");
  };
  return { minutes, setMinutes, parks: parksSeed, ready, error, saving, revision, configured: Boolean(cloud), publicAccess, reload, unlock, lock };
}