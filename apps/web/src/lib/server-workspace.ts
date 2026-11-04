"use client";

import { useEffect, useRef, useState } from "react";
import type { Minute, Park } from "./domain";
import { sharedStateSchema } from "./workspace-schema";
import { z } from "zod";

export const serverAccess = process.env.NEXT_PUBLIC_ACCESS_MODE === "company";
const snapshotSchema = z.object({ revision: z.number().int().nonnegative(), data: sharedStateSchema });

export function useServerWorkspace() {
  const [minutes, setMinutes] = useState<Minute[]>([]);
  const [parks, setParks] = useState<Park[]>([]);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const baseline = useRef("");
  const generation = useRef(0);
  const inFlight = useRef(false);
  const current = useRef({ minutes, parks });
  current.current = { minutes, parks };

  const request = async (path: string, init: RequestInit = {}) => {
    let response: Response;
    try { response = await fetch(`/cloud/${path}`, { ...init, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", ...init.headers }, signal: AbortSignal.timeout(45000) }); }
    catch { throw new Error("Servidor indisponível. Suas alterações não foram confirmadas; exporte antes de sair."); }
    let result: unknown;
    try { result = await response.json(); }
    catch { throw new Error("Resposta inválida do servidor. Suas alterações não foram confirmadas; exporte antes de sair."); }
    if (!response.ok) {
      const parsed = z.object({ error: z.string() }).safeParse(result);
      throw new Error(parsed.success ? parsed.data.error : "Falha de comunicação com o armazenamento privado.");
    }
    return result;
  };
  const reload = async (discard = false) => {
    if (!discard && baseline.current && JSON.stringify(current.current) !== baseline.current && !window.confirm("Há alterações não salvas. Recarregar e descartá-las?")) return;
    const version = generation.current;
    setError("");
    try {
      const data = snapshotSchema.parse(await request("workspace"));
      if (version !== generation.current) return;
      baseline.current = JSON.stringify(data.data);
      setMinutes(data.data.minutes); setParks(data.data.parks); setRevision(data.revision); setReady(true);
    } catch (failure) { if (version === generation.current) setError(failure instanceof Error ? failure.message : "Não foi possível ler as atas."); }
  };
  useEffect(() => {
    if (!serverAccess) return;
    let active = true;
    void request("session").then(async result => {
      const session = z.object({ authenticated: z.boolean() }).parse(result);
      if (!active) return;
      setIsAdmin(session.authenticated);
      if (session.authenticated) await reload(true);
    }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : "Não foi possível verificar a sessão."); });
    return () => { active = false; generation.current++; };
  }, []);

  useEffect(() => {
    if (!serverAccess || !ready || !isAdmin || saving || error || inFlight.current) return;
    const payload = JSON.stringify({ minutes, parks });
    if (payload === baseline.current) return;
    const timeout = setTimeout(async () => {
      const version = generation.current;
      setSaving(true); inFlight.current = true;
      try {
        const result = z.object({ revision: z.number().int().nonnegative() }).parse(await request("workspace", { method: "PUT", body: JSON.stringify({ expectedRevision: revision, data: JSON.parse(payload) }) }));
        if (version !== generation.current) return;
        baseline.current = payload; setRevision(result.revision);
      } catch (failure) { if (version === generation.current) setError(failure instanceof Error ? failure.message : "Não foi possível salvar. Exporte as alterações antes de sair."); }
      finally { inFlight.current = false; setSaving(false); }
    }, 500);
    return () => clearTimeout(timeout);
  }, [minutes, parks, ready, isAdmin, saving, error, revision]);

  useEffect(() => {
    if (!serverAccess) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (baseline.current && JSON.stringify(current.current) !== baseline.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  const signIn = async (password: string) => {
    await request("session", { method: "POST", body: JSON.stringify({ password }) });
    setIsAdmin(true); await reload(true);
  };
  const signOut = async () => {
    if (baseline.current && JSON.stringify(current.current) !== baseline.current) throw new Error("Existem alterações não salvas. Exporte ou atualize antes de sair.");
    await request("session", { method: "DELETE" });
    generation.current++; baseline.current = ""; setMinutes([]); setParks([]); setReady(false); setIsAdmin(false); setError(""); setRevision(0);
  };
  return { minutes, setMinutes, parks, setParks, ready, isAdmin, email: "Acesso da empresa", error, saving, revision, configured: true, publicAccess: true, reload, signIn, signOut, serverAccess: true };
}
