"use client";

import { useState } from "react";
import { Cloud, Download, Loader2, LockKeyhole, LogOut, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import type { useSharedWorkspace } from "@/lib/shared-workspace";

export function CloudAccess({ workspace }: { workspace: ReturnType<typeof useSharedWorkspace> }) {
  const [login, setLogin] = useState(true);
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!workspace.publicAccess) return null;
  const backup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ minutes: workspace.minutes, parks: workspace.parks }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "wind-planner-backup.json"; anchor.click(); URL.revokeObjectURL(url);
  };
  return <section className="cloud-access" aria-label="Acesso privado e armazenamento">
    <div className="cloud-access-row">
      <Cloud size={19} />
      <div>
        <strong>{workspace.serverAccess ? "Atas privadas · acesso da empresa" : workspace.isAdmin ? "Conta responsável · acesso exclusivo" : "Acesso privado · conta responsável"}</strong>
        <p role="status">{workspace.error || (workspace.saving ? "Salvando alterações na nuvem..." : workspace.isAdmin && !workspace.ready ? "Carregando suas pastas e atas..." : workspace.ready ? `Atas privadas na nuvem · revisão ${workspace.revision} · ${workspace.email}` : workspace.serverAccess ? "Entre com a senha da empresa. Os dados ficam no GitHub privado." : "Autentique-se por e-mail para acessar as atas.")}</p>
      </div>
      <div className="cloud-access-actions">
        {workspace.isAdmin && <Button variant="outline" size="sm" onClick={backup}><Download size={14} />Exportar</Button>}
        {workspace.isAdmin && <Button variant="outline" size="sm" disabled={workspace.saving} onClick={() => void workspace.reload()} title="Atualizar dados da nuvem"><RefreshCw size={14} />Atualizar</Button>}
        {workspace.configured && ((workspace.serverAccess ? workspace.isAdmin : workspace.email)
          ? <Button variant="outline" size="sm" onClick={() => void workspace.signOut().catch(error => setMessage(error.message))}><LogOut size={14} />Sair</Button>
          : <Button variant="outline" size="sm" onClick={() => setLogin(!login)}><LockKeyhole size={14} />Responsável</Button>)}
      </div>
    </div>
    {workspace.isAdmin && <p>{workspace.serverAccess ? "Quem conhece a senha pode consultar e alterar atas e anexos. Não compartilhe fora da empresa." : "Somente a conta responsável pode consultar e alterar atas e anexos."} Aguarde a confirmação da revisão antes de sair.</p>}
    {workspace.configured && login && !(workspace.serverAccess ? workspace.isAdmin : workspace.email) && <form className="cloud-login" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setMessage("");
      try { await workspace.signIn(address); setAddress(""); setMessage(workspace.serverAccess ? "" : "Se o endereço estiver autorizado, você receberá um link de acesso por e-mail."); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao solicitar acesso."); }
      finally { setBusy(false); }
    }}>
      <label>{workspace.serverAccess ? "Senha da empresa" : "E-mail do responsável"}<input type={workspace.serverAccess ? "password" : "email"} autoComplete={workspace.serverAccess ? "current-password" : "email"} maxLength={200} required value={address} onChange={event => setAddress(event.target.value)} /></label>
      <Button type="submit" disabled={busy}>{busy && <Loader2 size={14} className="spin" />}{workspace.serverAccess ? "Entrar" : "Receber link de acesso"}</Button>
    </form>}
    {message && <p className="cloud-message" role="status">{message}</p>}
  </section>;
}