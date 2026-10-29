import { z } from "zod";

export const checklist = ["Técnicos em férias", "Técnicos em treinamento", "Técnicos indisponíveis", "Conferência climática", "Ferramentas disponíveis", "Materiais disponíveis", "Backlog revisado", "CMS Overdue", "VTM Overdue", "Breakdowns", "Capacity Levelling", "Programação do Cliente", "Feriados da semana"];
export const roles = ["Administrador", "Dispatcher", "Leitor"] as const;
export type Role = typeof roles[number];
export type Actor = { companyId: string; id: string; name: string; role: Role };
export const minuteInput = z.object({
  parkId: z.uuid(), week: z.number().int().min(1).max(53), date: z.iso.date(),
  territory: z.string().trim().min(2).max(100), dispatcher: z.string().trim().min(3).max(200),
  participants: z.string().trim().min(3).max(20000),
  checklist: z.array(z.enum(checklist as [string, ...string[]])).max(13).refine(items => new Set(items).size === items.length, "Checklist duplicado"),
  sections: z.array(z.object({ title: z.string().trim().min(1).max(200), content: z.string().max(100000) })).max(250),
  links: z.array(z.object({ title: z.string().trim().min(1).max(200), url: z.url().max(2048).refine(url => /^https?:\/\//i.test(url), "Somente HTTP/HTTPS") })).max(200)
}).strict();
export type MinuteData = z.infer<typeof minuteInput>;
export type MinuteRecord = { id: string; company_id: string; park_id: string; week: number; meeting_date: string; dispatcher: string; status: "Rascunho" | "Pendente" | "Enviada"; version: number; data: MinuteData; created_at: string; updated_at: string; deleted_at?: string };
export const parkInput = z.object({ name: z.string().trim().min(3).max(200), client: z.string().trim().min(2).max(200), region: z.string().trim().min(2).max(100), state: z.string().trim().min(2).max(100), country: z.string().length(2).default("BR"), capacity: z.number().positive().max(100000), turbines: z.number().int().positive(), manager: z.string().trim().min(3).max(200) }).strict();
export type ParkData = z.infer<typeof parkInput>;
export const sendInput = z.object({ recipients: z.array(z.email()).min(1).max(100), version: z.number().int().positive() }).strict();
export const listInput = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20), parkId: z.uuid().optional(), week: z.coerce.number().int().min(1).max(53).optional(), dispatcher: z.string().max(200).optional(), region: z.string().max(100).optional(), status: z.enum(["Rascunho", "Pendente", "Enviada"]).optional(), from: z.iso.date().optional(), to: z.iso.date().optional(), search: z.string().max(200).optional() });
export type ListInput = z.infer<typeof listInput>;
export function isReady(data: MinuteData) {
  return checklist.every(item => data.checklist.includes(item)) && data.sections.some(section => section.content.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim().length > 0) && data.participants.trim().length > 0;
}
export const allowedFile = (name: string) => /\.(pdf|xlsx|csv|docx|pptx|png|jpe?g)$/i.test(name);
export function fileMatches(name: string, buffer: Buffer) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (["xlsx", "docx", "pptx"].includes(extension ?? "")) return buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (extension === "pdf") return buffer.subarray(0, 5).toString() === "%PDF-";
  if (extension === "png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (["jpg", "jpeg"].includes(extension ?? "")) return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  return extension === "csv" && !buffer.includes(0);
}