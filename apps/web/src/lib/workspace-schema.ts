import { z } from "zod";

const minuteSchema = z.object({
  id: z.string().min(1), parkId: z.string(), year: z.number().int().min(2000).max(2100).default(2026), week: z.number().int().min(1).max(53), date: z.string(), dispatcher: z.string(), participants: z.string(),
  status: z.enum(["Enviada", "Pendente", "Rascunho"]), checklist: z.array(z.string()),
  sections: z.array(z.object({ title: z.string(), content: z.string() })),
  links: z.array(z.object({ title: z.string(), url: z.url().refine(value => /^https?:\/\//i.test(value)) })),
  attachments: z.array(z.object({ id: z.string(), name: z.string(), size: z.number(), type: z.string(), data: z.string().refine(value => /^data:(application\/(pdf|vnd\.[a-z0-9.+-]+)|text\/csv|image\/(png|jpeg));base64,/i.test(value)), version: z.number() })),
  version: z.number(), audit: z.array(z.object({ version: z.number(), actor: z.string(), date: z.string(), action: z.string() })), sentAt: z.string().optional()
});
export const sharedStateSchema = z.object({ minutes: z.array(minuteSchema), parks: z.array(z.unknown()).default([]) });
