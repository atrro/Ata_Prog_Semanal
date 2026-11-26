"use client";

import { useState } from "react";
import { Cloud, Download, Loader2, LockKeyhole, LogOut, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import type { useSharedWorkspace } from "@/lib/shared-workspace";

export function CloudAccess({ workspace }: { workspace: ReturnType<typeof useSharedWorkspace> }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!workspace.publicAccess) return null;
  const backup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ minutes: workspace.minutes, parks: workspace.parks }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "wind-planner-backup.json"; anchor.click(); URL.revokeObjectURL(url);
  };
  const signedIn = Boolean(workspace.account);
  return <section className="cloud-access" aria-label="Acesso privado e armazenamento">
    <div className="cloud-access-row">
      <Cloud size={19} />
      <div>
        <strong>{workspace.isAdmin ? "Conta responsável · acesso exclusivo" : "Acesso privado · conta responsável"}</strong>
        <p role="status">{workspace.error || (workspace.saving ? "Salvando alterações na nuvem..." : workspace.isAdmin && !workspace.ready ? "Carregando suas pastas e atas..." : workspace.ready ? `Atas privadas na nuvem · revisão ${workspace.revision} · GitHub: ${workspace.account}` : "Entre com sua conta do GitHub autorizada para acessar as atas.")}</p>
      </div>
      <div className="cloud-access-actions">
        {workspace.isAdmin && <Button variant="outline" size="sm" onClick={backup}><Download size={14} />Exportar</Button>}
        {workspace.isAdmin && <Button variant="outline" size="sm" disabled={workspace.saving} onClick={() => void workspace.reload()} title="Atualizar dados da nuvem"><RefreshCw size={14} />Atualizar</Button>}
        {workspace.configured && signedIn && <Button variant="outline" size="sm" onClick={() => void workspace.signOut().catch(error => setMessage(error.message))}><LogOut size={14} />Sair</Button>}
        {workspace.configured && !signedIn && <Button size="sm" disabled={busy} onClick={async () => {
          setBusy(true); setMessage("");
          try { await workspace.signIn(); }
          catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao iniciar o login."); setBusy(false); }
        }}>{busy ? <Loader2 size={14} className="spin" /> : <LockKeyhole size={14} />}Entrar com GitHub</Button>}
      </div>
    </div>
    {workspace.isAdmin && <p>Somente a conta responsável do GitHub pode consultar e alterar atas e anexos. Aguarde a confirmação da revisão antes de sair.</p>}
    {message && <p className="cloud-message" role="status">{message}</p>}
  </section>;
}
