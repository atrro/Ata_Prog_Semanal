import { z } from "zod";

export const checklistLabels = ["Técnicos em férias", "Técnicos em treinamento", "Técnicos indisponíveis", "Conferência climática", "Ferramentas disponíveis", "Materiais disponíveis", "Backlog revisado", "CMS Overdue", "VTM Overdue", "Breakdowns", "Capacity Levelling", "Programação do Cliente", "Feriados da semana"];
export const sectionLabels = ["Programação Semanal", "Distribuição de Técnicos", "Disponibilidade da Equipe", "Técnicos em Férias, Treinamento e Indisponíveis", "Feriados da Semana", "Materiais Necessários", "Ferramentas Necessárias", "Condições Climáticas", "CMS Overdue", "Breakdowns", "Restrições Operacionais", "Ações Necessárias", "Pontos de Atenção", "Comentários Gerais"];
export const defaultParticipants = "Supervisor:\nLíder Técnico:\nStock Keeper:\nPlanejador:\nOutros participantes:";
export type Status = "Enviada" | "Pendente" | "Rascunho";
export type Role = "Administrador" | "Dispatcher" | "Leitor";
export const dispatcherInitials = ["NTROG", "MADLT", "VAVNO", "LUAIA", "TOEZL", "EARTO", "ATRLM", "FNAEM", "IASAS", "HESAD", "FADSV", "ADCCI", "AFPDA", "ELATI", "SMEOA", "OBNMJ", "JOPOM", "MMEID", "ADMIO", "FNAOI", "ATRRO"];
export const defaultNewMinuteYear = 2027;
export type Park = { id: string; name: string; state: string; turbineType: string; turbines: number };
export type Attachment = { id: string; name: string; size: number; type: string; data: string; version: number };
export type Audit = { version: number; actor: string; date: string; action: string };
export type Minute = { id: string; parkId: string; year: number; week: number; date: string; dispatcher: string; participants: string; status: Status; checklist: string[]; sections: { title: string; content: string }[]; links: { title: string; url: string }[]; attachments: Attachment[]; version: number; audit: Audit[]; sentAt?: string };
export const weekLabel = (minute: Pick<Minute, "year" | "week">) => `Y${minute.year}_W${minute.week}`;
export const minuteSchema = z.object({ parkId: z.string().min(1, "Selecione um parque"), year: z.number().int().min(2000).max(2100), week: z.number().int().min(1).max(53), date: z.string().min(1, "Informe a data"), dispatcher: z.string().trim().max(5, "Máximo de 5 caracteres").refine(value => dispatcherInitials.includes(value.toUpperCase()), "Verifique se suas iniciais estão corretas").transform(value => value.toUpperCase()), participants: z.string().min(3, "Informe os participantes") });
export type MinuteFields = z.infer<typeof minuteSchema>;
export const stripHtml = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
export const hasContent = (html: string) => stripHtml(html).length > 0 || /<(img|table)\b/i.test(html);
export function canSend(minute: Minute) { return checklistLabels.every(label => minute.checklist.includes(label)) && minute.sections.some(section => hasContent(section.content)) && minute.participants.trim().length > 0; }
export const formatDateBr = (date: string) => /^\d{4}-\d{2}-\d{2}/.test(date) ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : date;
export function lastMinuteOf(minutes: Minute[], parkId: string) {
  return minutes.filter(minute => minute.parkId === parkId).sort((a, b) => b.year - a.year || b.week - a.week || b.date.localeCompare(a.date))[0];
}
export const nextWeekOf = (minute: Pick<Minute, "year" | "week">) => minute.week >= 53 ? { year: minute.year + 1, week: 1 } : { year: minute.year, week: minute.week + 1 };
export function nextVersion(minute: Minute, actor: string, action: string): Minute {
  const version = minute.version + 1;
  return { ...minute, version, audit: [...minute.audit, { version, actor, date: new Date().toISOString(), action }] };
}
export function safeUrl(value: string) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export const parksSeed: Park[] = [
  { id: "park-01", state: "RN", name: "Angicos", turbineType: "V150", turbines: 38 },
  { id: "park-02", state: "RN", name: "Aventura", turbineType: "V150", turbines: 25 },
  { id: "park-03", state: "RN", name: "Catanduba", turbineType: "V150", turbines: 22 },
  { id: "park-04", state: "RN", name: "Cabeço Preto", turbineType: "V100", turbines: 92 },
  { id: "park-05", state: "CE", name: "Kairós", turbineType: "V150", turbines: 25 },
  { id: "park-06", state: "RN", name: "Monte verde", turbineType: "V150", turbines: 76 },
  { id: "park-07", state: "CE", name: "Serrote e Serra do Mato", turbineType: "V150", turbines: 78 },
  { id: "park-08", state: "PI", name: "Ventos do Piauí", turbineType: "V150", turbines: 93 },
  { id: "park-09", state: "BA", name: "Aroeira", turbineType: "V150", turbines: 81 },
  { id: "park-10", state: "RN", name: "Cumaru", turbineType: "V150", turbines: 49 },
  { id: "park-11", state: "RN", name: "Jerusalém", turbineType: "V150", turbines: 62 },
  { id: "park-12", state: "RN", name: "Macambira", turbineType: "V110", turbines: 18 },
  { id: "park-13", state: "BA", name: "Morro do Chapeu II", turbineType: "V150", turbines: 84 },
  { id: "park-14", state: "RN", name: "Mundo Novo", turbineType: "V150", turbines: 23 },
  { id: "park-15", state: "BA", name: "Pedra do Reino", turbineType: "V110", turbines: 30 },
  { id: "park-16", state: "BA", name: "Pedra Pintada", turbineType: "V150", turbines: 43 },
  { id: "park-17", state: "RN", name: "Pedra Rajada", turbineType: "V110", turbines: 20 },
  { id: "park-18", state: "RN", name: "Seridó", turbineType: "V150", turbines: 55 },
  { id: "park-19", state: "RN", name: "Santa Rosa Mundo Novo", turbineType: "V150", turbines: 37 },
  { id: "park-20", state: "RN", name: "Vilas", turbineType: "V150", turbines: 65 },
  { id: "park-21", state: "RN", name: "Vilas IV", turbineType: "V150", turbines: 49 },
  { id: "park-22", state: "BA", name: "Assuruá", turbineType: "V150", turbines: 47 },
  { id: "park-23", state: "BA", name: "Babilônia Centro", turbineType: "V150", turbines: 123 },
  { id: "park-24", state: "BA", name: "Babilônia Sul CDV", turbineType: "V150", turbines: 80 },
  { id: "park-25", state: "BA", name: "Campo Largo", turbineType: "V150", turbines: 86 },
  { id: "park-26", state: "BA", name: "Folha Larga Norte", turbineType: "V150", turbines: 82 },
  { id: "park-27", state: "BA", name: "Folha Larga CDV", turbineType: "V150", turbines: 36 },
  { id: "park-28", state: "BA", name: "Novo Horizonte", turbineType: "V150", turbines: 94 },
  { id: "park-29", state: "BA", name: "Serra das Almas", turbineType: "V150", turbines: 58 },
  { id: "park-30", state: "BA", name: "Serra do Assuruá", turbineType: "V150", turbines: 188 },
  { id: "park-31", state: "BA", name: "Ventos da Bahia", turbineType: "V110", turbines: 53 },
  { id: "park-32", state: "CE", name: "Icaraí", turbineType: "S95", turbines: 31 },
  { id: "park-33", state: "RJ", name: "Gargaú", turbineType: "V82", turbines: 17 },
  { id: "park-34", state: "PE", name: "Gravatá", turbineType: "V82", turbines: 15 },
  { id: "park-35", state: "CE", name: "Taiba", turbineType: "S95", turbines: 27 },
  { id: "park-36", state: "BA", name: "Delfina", turbineType: "V110", turbines: 90 },
  { id: "park-37", state: "BA", name: "Morro do Chapeu I", turbineType: "V110", turbines: 86 },
  { id: "park-38", state: "BA", name: "Sento Sé", turbineType: "V100", turbines: 39 },
  { id: "park-39", state: "RN", name: "CGN", turbineType: "V100", turbines: 30 },
  { id: "park-40", state: "RN", name: "Copel", turbineType: "V100", turbines: 47 },
  { id: "park-41", state: "RN", name: "Elera", turbineType: "V100", turbines: 75 },
  { id: "park-42", state: "RS", name: "Honda", turbineType: "V136", turbines: 10 },
  { id: "park-43", state: "PE", name: "Ouro Branco", turbineType: "V150", turbines: 21 },
  { id: "park-44", state: "RN", name: "Rio do Vento Expansão", turbineType: "V150", turbines: 120 },
  { id: "park-45", state: "RN", name: "Rio do Vento II", turbineType: "V150", turbines: 120 },
  { id: "park-46", state: "PE", name: "Serra das Vacas", turbineType: "V150", turbines: 19 },
  { id: "park-47", state: "RN", name: "Serra do Tigre", turbineType: "V150", turbines: 168 },
  { id: "park-48", state: "RN", name: "Umari", turbineType: "V150", turbines: 45 },
  { id: "park-49", state: "CE", name: "Amontada", turbineType: "ECO 122", turbines: 28 },
  { id: "park-50", state: "PI", name: "Caldeirão", turbineType: "ECO 122", turbines: 70 },
  { id: "park-51", state: "RN", name: "Riachão", turbineType: "ECO 122", turbines: 54 },
  { id: "park-52", state: "RN", name: "Alegria", turbineType: "V82", turbines: 92 },
  { id: "park-53", state: "PI", name: "Dom Inocêncio", turbineType: "V150", turbines: 184 },
  { id: "park-54", state: "RN", name: "Esquina do Vento", turbineType: "V150", turbines: 51 }
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
  const dispatcher = dispatcherInitials[index % dispatcherInitials.length];
  return { id: `ata-${index + 1}`, parkId: parksSeed[index % parksSeed.length].id, year: 2026, week: 44 - Math.floor(index / 12), date, dispatcher, participants: "Supervisor: Ricardo Almeida\nLíder Técnico: Marcos Silva\nStock Keeper: Bruno Costa\nPlanejador: " + dispatcher, status, checklist: status === "Enviada" ? [...checklistLabels] : checklistLabels.slice(0, 9), sections: sectionLabels.map((title, sectionIndex) => ({ title, content: sectionIndex === 0 ? "<p>Manutenção preventiva dos aerogeradores conforme planejamento semanal. Inspeções de rotina e acompanhamento dos indicadores de disponibilidade.</p>" : sectionIndex === 7 ? "<p>Condições favoráveis. Monitorar ventos acima de 12 m/s nas atividades em altura.</p>" : sectionIndex === 11 ? "<p>Confirmar entrega dos materiais e alinhamento da equipe técnica até sexta-feira.</p>" : "" })), links: [{ title: "Painel de disponibilidade", url: "https://app.powerbi.com" }], attachments: [], version: status === "Enviada" ? 2 : 1, audit: [{ version: 1, actor: dispatcher, date: `${date}T09:00:00Z`, action: "Ata criada" }, ...(status === "Enviada" ? [{ version: 2, actor: dispatcher, date: `${date}T14:30:00Z`, action: "Envio registrado (demonstração)" }] : [])], ...(status === "Enviada" ? { sentAt: `${date}T14:30:00Z` } : {}) };
});