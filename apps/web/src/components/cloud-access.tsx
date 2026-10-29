"use client";

import { useState } from "react";
import { Cloud, Download, Loader2, LockKeyhole, LogOut, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import type { useSharedWorkspace } from "@/lib/shared-workspace";

export function CloudAccess({ workspace }: { workspace: ReturnType<typeof useSharedWorkspace> }) {
  const [login, setLogin] = useState(false);
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!workspace.publicAccess) return null;
  const backup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ minutes: workspace.minutes, parks: workspace.parks }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "wind-planner-public-backup.json"; anchor.click(); URL.revokeObjectURL(url);
  };
  return <section className="cloud-access" aria-label="Acesso público e armazenamento">
    <div className="cloud-access-row">
      <Cloud size={19} />
      <div>
        <strong>{workspace.isAdmin ? "Administração da publicação" : "Consulta pública · sem cadastro"}</strong>
        <p role="status">{workspace.error || (workspace.saving ? "Publicando alterações na nuvem..." : !workspace.ready ? "Aguardando conexão com o armazenamento compartilhado." : `Dados compartilhados na nuvem · revisão ${workspace.revision}${workspace.isAdmin ? ` · ${workspace.email}` : " · somente leitura"}`)}</p>
      </div>
      <div className="cloud-access-actions">
        {workspace.isAdmin && <Button variant="outline" size="sm" onClick={backup}><Download size={14} />Exportar</Button>}
        {workspace.configured && <Button variant="outline" size="sm" disabled={workspace.saving} onClick={() => void workspace.reload()} title="Atualizar dados da nuvem"><RefreshCw size={14} />Atualizar</Button>}
        {workspace.configured && (workspace.email
          ? <Button variant="outline" size="sm" onClick={() => void workspace.signOut().catch(error => setMessage(error.message))}><LogOut size={14} />Sair</Button>
          : <Button variant="outline" size="sm" onClick={() => setLogin(!login)}><LockKeyhole size={14} />Responsável</Button>)}
      </div>
    </div>
    {workspace.isAdmin && <p className="public-warning">Tudo o que for publicado aqui poderá ser consultado por qualquer pessoa com o link. Não inclua dados pessoais ou informações confidenciais.</p>}
    {login && !workspace.email && <form className="cloud-login" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setMessage("");
      try { await workspace.signIn(address); setMessage("Se o endereço estiver autorizado, você receberá um link de acesso por e-mail."); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao solicitar acesso."); }
      finally { setBusy(false); }
    }}>
      <label>E-mail do responsável<input type="email" autoComplete="email" required value={address} onChange={event => setAddress(event.target.value)} /></label>
      <Button type="submit" disabled={busy}>{busy && <Loader2 size={14} className="spin" />}Receber link de acesso</Button>
    </form>}
    {message && <p className="cloud-message" role="status">{message}</p>}
  </section>;
}