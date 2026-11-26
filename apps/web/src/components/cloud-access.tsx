"use client";

import { useState } from "react";
import { Cloud, Download, LogOut, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import type { useSharedWorkspace } from "@/lib/shared-workspace";

export function CloudAccess({ workspace }: { workspace: ReturnType<typeof useSharedWorkspace> }) {
  const [message, setMessage] = useState("");
  if (!workspace.publicAccess) return null;
  const backup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ minutes: workspace.minutes, parks: workspace.parks }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "wind-planner-backup.json"; anchor.click(); URL.revokeObjectURL(url);
  };
  const status = workspace.error || (workspace.saving ? "Salvando alterações na nuvem..." : workspace.ready ? `Atas privadas na nuvem · revisão ${workspace.revision}` : "Digite a senha para carregar suas pastas e atas.");
  return <section className="cloud-access" aria-label="Acesso privado e armazenamento">
    <div className="cloud-access-row">
      <Cloud size={19} />
      <div>
        <strong>Acesso privado · senha compartilhada</strong>
        <p role="status">{status}</p>
      </div>
      {workspace.ready && <div className="cloud-access-actions">
        <Button variant="outline" size="sm" onClick={backup}><Download size={14} />Exportar</Button>
        <Button variant="outline" size="sm" disabled={workspace.saving} onClick={() => void workspace.reload()} title="Atualizar dados da nuvem"><RefreshCw size={14} />Atualizar</Button>
        <Button variant="outline" size="sm" onClick={() => { try { workspace.lock(); setMessage(""); } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível sair."); } }}><LogOut size={14} />Sair</Button>
      </div>}
    </div>
    {workspace.ready && <p>Somente quem conhece a senha de acesso pode consultar e alterar atas e anexos. Aguarde a confirmação da revisão antes de sair.</p>}
    {message && <p className="cloud-message" role="status">{message}</p>}
  </section>;
}
