import { z } from "zod";

const parkSchema = z.object({ id: z.string().min(1), name: z.string(), client: z.string(), region: z.string(), state: z.string(), capacity: z.number(), manager: z.string(), turbines: z.number() });
const minuteSchema = z.object({
  id: z.string().min(1), parkId: z.string(), week: z.number().int().min(1).max(53), date: z.string(), territory: z.string(), dispatcher: z.string(), participants: z.string(),
  status: z.enum(["Enviada", "Pendente", "Rascunho"]), checklist: z.array(z.string()),
  sections: z.array(z.object({ title: z.string(), content: z.string() })),
  links: z.array(z.object({ title: z.string(), url: z.url().refine(value => /^https?:\/\//i.test(value)) })),
  attachments: z.array(z.object({ id: z.string(), name: z.string(), size: z.number(), type: z.string(), data: z.string().refine(value => /^data:(application\/(pdf|vnd\.[a-z0-9.+-]+)|text\/csv|image\/(png|jpeg));base64,/i.test(value)), version: z.number() })),
  version: z.number(), audit: z.array(z.object({ version: z.number(), actor: z.string(), date: z.string(), action: z.string() })), sentAt: z.string().optional()
});
export const sharedStateSchema = z.object({ minutes: z.array(minuteSchema), parks: z.array(parkSchema) });
