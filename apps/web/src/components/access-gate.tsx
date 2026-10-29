"use client";

<<<<<<< HEAD
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "./ui/button";
import { Workspace } from "./workspace";
import { useSharedWorkspace } from "@/lib/shared-workspace";
import { CloudAccess } from "./cloud-access";

function PasswordForm({ onSubmit }: { onSubmit: (password: string) => Promise<string> }) {
=======
import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Wind } from "lucide-react";
import { accessSessionKey, matchesAccessPassword } from "@/lib/access";
import { Button } from "./ui/button";
import { Workspace } from "./workspace";

export function AccessGate() {
  const [unlocked, setUnlocked] = useState(false);
>>>>>>> b16087c (Add password entry screen and fix GitHub Pages deployment)
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
<<<<<<< HEAD
  return <form onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const message = await onSubmit(password);
      if (message) setError(message); else setPassword("");
    } finally { setBusy(false); }
  }}>
    <label htmlFor="access-password">Senha de acesso</label>
    <div className={`login-password ${error ? "login-password-invalid" : ""}`}>
      <LockKeyhole size={17} />
      <input id="access-password" type={visible ? "text" : "password"} value={password} autoComplete="current-password" required maxLength={200} aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} onChange={event => { setPassword(event.target.value); setError(""); }} />
      <button type="button" title={visible ? "Ocultar senha" : "Mostrar senha"} aria-label={visible ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
    </div>
    {error && <p id="login-error" className="login-error" role="alert">{error}</p>}
    <Button type="submit" disabled={busy || !password} className="login-submit">{busy ? <><Loader2 size={17} className="spin" />Entrando...</> : <>Entrar<ArrowRight size={17} /></>}</Button>
  </form>;
}

export function AccessGate() {
  const workspace = useSharedWorkspace();

  // Sem nuvem configurada, o modo local abre direto com dados fictícios; a senha só protege o modo Supabase.
  if (!workspace.publicAccess) return <Workspace shared={workspace} />;
  if (workspace.ready) return <Workspace shared={workspace} />;

  return <main className="login-page">
    <div className="login-background" />
    <section className="login-panel" aria-labelledby="private-login-title">
      <span className="login-icon"><LockKeyhole size={23} /></span>
      <h1 id="private-login-title">Wind Planner</h1>
      <p className="login-subtitle">Atas privadas. Digite a senha de acesso para consultar suas pastas e criar uma nova ata.</p>
      <PasswordForm onSubmit={async password => {
        try { await workspace.unlock(password); return ""; }
        catch (failure) { return failure instanceof Error ? failure.message : "Não foi possível entrar. Tente novamente."; }
      }} />
      <CloudAccess workspace={workspace} />
    </section>
=======

  useEffect(() => {
    try { setUnlocked(sessionStorage.getItem(accessSessionKey) === "unlocked"); } catch { setUnlocked(false); }
  }, []);

  const lock = () => {
    try { sessionStorage.removeItem(accessSessionKey); } finally { setPassword(""); setError(""); setUnlocked(false); }
  };

  if (unlocked) return <Workspace onLock={lock} />;

  return <main className="login-page">
    <div className="login-background" />
    <div className="login-brand"><Wind size={29} /><span>wind<strong>planner</strong></span></div>
    <section className="login-panel" aria-labelledby="login-title">
      <span className="login-icon"><LockKeyhole size={23} /></span>
      <div className="login-eyebrow">VESTAS BRASIL · SERVICE OPERATIONS</div>
      <h1 id="login-title">Wind Planner</h1>
      <p className="login-subtitle">Programação semanal de operação e manutenção.</p>
      <form onSubmit={async event => {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setError("");
        try {
          if (!await matchesAccessPassword(password)) { setError("Senha incorreta. Tente novamente."); return; }
          sessionStorage.setItem(accessSessionKey, "unlocked");
          setPassword(""); setUnlocked(true);
        } catch { setError("Não foi possível iniciar a sessão. Verifique se o navegador permite armazenamento e tente novamente."); }
        finally { setBusy(false); }
      }}>
        <label htmlFor="access-password">Senha de acesso</label>
        <div className={`login-password ${error ? "login-password-invalid" : ""}`}>
          <LockKeyhole size={17} />
          <input id="access-password" type={visible ? "text" : "password"} value={password} autoComplete="current-password" required maxLength={200} aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} onChange={event => { setPassword(event.target.value); setError(""); }} />
          <button type="button" title={visible ? "Ocultar senha" : "Mostrar senha"} aria-label={visible ? "Ocultar senha" : "Mostrar senha"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
        </div>
        {error && <p id="login-error" className="login-error" role="alert">{error}</p>}
        <Button type="submit" disabled={busy || !password} className="login-submit">{busy ? <><Loader2 size={17} className="spin" />Entrando...</> : <>Entrar<ArrowRight size={17} /></>}</Button>
      </form>
      <div className="login-panel-footer"><span className="status-dot" />Planejamento conectado.</div>
    </section>
    <footer className="login-footer"><span>One Standard. One Process. One Voice.</span><span>© 2026 Wind Planner</span></footer>
>>>>>>> b16087c (Add password entry screen and fix GitHub Pages deployment)
  </main>;
}