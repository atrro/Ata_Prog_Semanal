import { z } from "zod";

export const checklistLabels = ["Técnicos em férias", "Técnicos em treinamento", "Técnicos indisponíveis", "Conferência climática", "Ferramentas disponíveis", "Materiais disponíveis", "Backlog revisado", "CMS Overdue", "VTM Overdue", "Breakdowns", "Capacity Levelling", "Programação do Cliente", "Feriados da semana"];
export const sectionLabels = ["Programação Semanal", "Distribuição de Técnicos", "Disponibilidade da Equipe", "Materiais Necessários", "Ferramentas Necessárias", "Condições Climáticas", "CMS Overdue", "Breakdowns", "Restrições Operacionais", "Ações Necessárias", "Pontos de Atenção", "Comentários Gerais"];
export type Status = "Enviada" | "Pendente" | "Rascunho";
export type Role = "Administrador" | "Dispatcher" | "Leitor";
export type Park = { id: string; name: string; client: string; region: string; state: string; capacity: number; manager: string; turbines: number };
export type Attachment = { id: string; name: string; size: number; type: string; data: string; version: number };
export type Audit = { version: number; actor: string; date: string; action: string };
export type Minute = { id: string; parkId: string; week: number; date: string; territory: string; dispatcher: string; participants: string; status: Status; checklist: string[]; sections: { title: string; content: string }[]; links: { title: string; url: string }[]; attachments: Attachment[]; version: number; audit: Audit[]; sentAt?: string };
export const minuteSchema = z.object({ parkId: z.string().min(1, "Selecione um parque"), week: z.number().int().min(1).max(53), date: z.string().min(1, "Informe a data"), territory: z.string().min(2, "Informe o território"), dispatcher: z.string().min(3, "Informe o responsável"), participants: z.string().min(3, "Informe os participantes") });
export type MinuteFields = z.infer<typeof minuteSchema>;
export const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
export function canSend(minute: Minute) { return checklistLabels.every(label => minute.checklist.includes(label)) && minute.sections.some(section => stripHtml(section.content).length > 0) && minute.participants.trim().length > 0; }
export function nextVersion(minute: Minute, actor: string, action: string): Minute {
  const version = minute.version + 1;
  return { ...minute, version, audit: [...minute.audit, { version, actor, date: new Date().toISOString(), action }] };
}
export function safeUrl(value: string) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export const parksSeed: Park[] = [
  { id: "p1", name: "Complexo Eólico Serra do Mel", client: "Voltalia", region: "Nordeste", state: "RN", capacity: 320, manager: "Ricardo Almeida", turbines: 92 },
  { id: "p2", name: "Parque Eólico Lagoa dos Ventos", client: "Enel Green Power", region: "Nordeste", state: "PI", capacity: 716, manager: "Mariana Costa", turbines: 230 },
  { id: "p3", name: "Complexo Eólico Ventos do Araripe", client: "Auren Energia", region: "Nordeste", state: "PE", capacity: 358, manager: "Paulo Santos", turbines: 156 },
  { id: "p4", name: "Parque Eólico Alto Sertão", client: "AES Brasil", region: "Nordeste", state: "BA", capacity: 386, manager: "Camila Ferreira", turbines: 184 },
  { id: "p5", name: "Complexo Eólico Osório", client: "EDP Renováveis", region: "Sul", state: "RS", capacity: 150, manager: "Lucas Oliveira", turbines: 75 },
  { id: "p6", name: "Parque Eólico São Clemente", client: "Echoenergia", region: "Nordeste", state: "PE", capacity: 216, manager: "Fernanda Lima", turbines: 126 }
];
export const people = [
  { name: "Ana Martins", initials: "AM", role: "Administrador" as Role, email: "ana.martins@example.com", color: "teal" },
  { name: "Carlos Eduardo", initials: "CE", role: "Dispatcher" as Role, email: "carlos.eduardo@example.com", color: "blue" },
  { name: "Juliana Souza", initials: "JS", role: "Dispatcher" as Role, email: "juliana.souza@example.com", color: "rose" },
  { name: "Rafael Mendes", initials: "RM", role: "Dispatcher" as Role, email: "rafael.mendes@example.com", color: "amber" },
  { name: "Beatriz Lima", initials: "BL", role: "Leitor" as Role, email: "beatriz.lima@example.com", color: "purple" }
];
export const minutesSeed: Minute[] = Array.from({ length: 42 }, (_, index) => {
  const status: Status = index < 3 ? "Pendente" : index === 4 || index === 7 || index === 9 ? "Rascunho" : "Enviada";
  const date = `2026-10-${String(Math.max(1, 29 - Math.floor(index / 3) * 2)).padStart(2, "0")}`;
  const dispatcher = people[1 + index % 3].name;
  return { id: `ata-${index + 1}`, parkId: parksSeed[index % 6].id, week: 44 - Math.floor(index / 12), date, territory: index % 6 === 4 ? "Sul" : "Nordeste", dispatcher, participants: "Supervisor: Ricardo Almeida\nLíder Técnico: Marcos Silva\nStock Keeper: Bruno Costa\nPlanejador: " + dispatcher, status, checklist: status === "Enviada" ? [...checklistLabels] : checklistLabels.slice(0, 9), sections: sectionLabels.map((title, sectionIndex) => ({ title, content: sectionIndex === 0 ? "<p>Manutenção preventiva dos aerogeradores conforme planejamento semanal. Inspeções de rotina e acompanhamento dos indicadores de disponibilidade.</p>" : sectionIndex === 5 ? "<p>Condições favoráveis. Monitorar ventos acima de 12 m/s nas atividades em altura.</p>" : sectionIndex === 9 ? "<p>Confirmar entrega dos materiais e alinhamento da equipe técnica até sexta-feira.</p>" : "" })), links: [{ title: "Painel de disponibilidade", url: "https://app.powerbi.com" }], attachments: [], version: status === "Enviada" ? 2 : 1, audit: [{ version: 1, actor: dispatcher, date: `${date}T09:00:00Z`, action: "Ata criada" }, ...(status === "Enviada" ? [{ version: 2, actor: dispatcher, date: `${date}T14:30:00Z`, action: "Envio registrado (demonstração)" }] : [])], ...(status === "Enviada" ? { sentAt: `${date}T14:30:00Z` } : {}) };
});