import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Inject, NotFoundException, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { SaveMinute, ListMinutes } from "../application/handlers";
import { MinutesRepository } from "../application/repository";
import { DeliveryService } from "../application/delivery";
import { allowedFile, fileMatches, listInput, minuteInput, parkInput, sendInput, type MinuteRecord } from "../domain/minute";
import { Public, RequireRoles, type AuthRequest } from "../infrastructure/auth";
import { Database } from "../infrastructure/database";
import { Storage } from "../infrastructure/storage";
import { generatePdf } from "../infrastructure/pdf";
import { auditVersion } from "../infrastructure/minutes.repository";
import { Integrations } from "../infrastructure/integrations";

const uuid = (value: string) => z.uuid().parse(value);
const version = (value: string | undefined) => z.coerce.number().int().positive().parse(value?.replace(/"/g, ""));
@ApiTags("Wind Planner")
@ApiBearerAuth()
@Controller()
export class ApiController {
  constructor(@Inject(CommandBus) private readonly commands: CommandBus, @Inject(QueryBus) private readonly queries: QueryBus, @Inject(MinutesRepository) private readonly minutes: MinutesRepository, @Inject(Database) private readonly database: Database, @Inject(Storage) private readonly storage: Storage, @Inject(DeliveryService) private readonly delivery: DeliveryService, @Inject(Integrations) private readonly integrations: Integrations) {}
  @Public() @Get("health/live") live() { return { status: "ok", service: "wind-planner-api" }; }
  @Public() @Get("health/ready") async ready() { await this.database.query("SELECT 1 FROM schema_migrations LIMIT 1"); return { status: "ready" }; }
  @Get("me") me(@Req() req: AuthRequest) { return req.actor; }
  @Get("users") @RequireRoles("Administrador") async users(@Req() req: AuthRequest) { return (await this.database.query("SELECT id,name,role,last_seen_at FROM users WHERE company_id=$1 ORDER BY name", [req.actor.companyId])).rows; }
  @Get("parks") async parks(@Req() req: AuthRequest) { return (await this.database.query("SELECT * FROM parks WHERE company_id=$1 AND deleted_at IS NULL ORDER BY name", [req.actor.companyId])).rows; }
  @Post("parks") @RequireRoles("Administrador") async createPark(@Req() req: AuthRequest, @Body() body: unknown) {
    const data = parkInput.parse(body);
    return this.database.transaction(async client => {
      const park = (await client.query("INSERT INTO parks(company_id,name,client,region,state,country,capacity,turbines,manager) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *", [req.actor.companyId, data.name, data.client, data.region, data.state, data.country, data.capacity, data.turbines, data.manager])).rows[0];
      await client.query("INSERT INTO audit_events(company_id,actor_id,entity_id,action,details) VALUES($1,$2,$3,'PARK_CREATED',$4)", [req.actor.companyId, req.actor.id, park.id, data]); return park;
    });
  }
  @Patch("parks/:id") @RequireRoles("Administrador") async updatePark(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: unknown) {
    const data = parkInput.parse(body);
    return this.database.transaction(async client => {
      const result = await client.query("UPDATE parks SET name=$3,client=$4,region=$5,state=$6,country=$7,capacity=$8,turbines=$9,manager=$10,updated_at=now() WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL RETURNING *", [uuid(id), req.actor.companyId, data.name, data.client, data.region, data.state, data.country, data.capacity, data.turbines, data.manager]);
      if (!result.rows[0]) throw new NotFoundException();
      await client.query("INSERT INTO audit_events(company_id,actor_id,entity_id,action,details) VALUES($1,$2,$3,'PARK_UPDATED',$4)", [req.actor.companyId, req.actor.id, id, data]); return result.rows[0];
    });
  }
  @Delete("parks/:id") @RequireRoles("Administrador") @HttpCode(204) async deletePark(@Req() req: AuthRequest, @Param("id") id: string) {
    await this.database.transaction(async client => {
      const park = await client.query("SELECT id FROM parks WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR UPDATE", [uuid(id), req.actor.companyId]);
      if (!park.rowCount) throw new NotFoundException();
      if ((await client.query("SELECT 1 FROM minutes WHERE park_id=$1 AND company_id=$2", [id, req.actor.companyId])).rowCount) throw new BadRequestException("Parque possui histórico de atas");
      await client.query("UPDATE parks SET deleted_at=now() WHERE id=$1 AND company_id=$2", [id, req.actor.companyId]);
      await client.query("INSERT INTO audit_events(company_id,actor_id,entity_id,action) VALUES($1,$2,$3,'PARK_DELETED')", [req.actor.companyId, req.actor.id, id]);
    });
  }
  @Get("minutes") list(@Req() req: AuthRequest, @Query() query: unknown) { return this.queries.execute(new ListMinutes(req.actor, listInput.parse(query))); }
  @Get("minutes/:id") async get(@Req() req: AuthRequest, @Param("id") id: string, @Res({ passthrough: true }) res: Response) { const minute = await this.minutes.get(req.actor, uuid(id)); res.setHeader("ETag", `"${minute.version}"`); return minute; }
  @Post("minutes") @RequireRoles("Administrador", "Dispatcher") create(@Req() req: AuthRequest, @Body() body: unknown) { return this.commands.execute(new SaveMinute(req.actor, null, minuteInput.parse(body))); }
  @Patch("minutes/:id") @RequireRoles("Administrador", "Dispatcher") update(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: unknown, @Headers("if-match") match: string) { return this.commands.execute(new SaveMinute(req.actor, uuid(id), minuteInput.parse(body), version(match))); }
  @Delete("minutes/:id") @RequireRoles("Administrador") @HttpCode(204) remove(@Req() req: AuthRequest, @Param("id") id: string, @Headers("if-match") match: string) { return this.minutes.remove(req.actor, uuid(id), version(match)); }
  @Get("minutes/:id/versions") history(@Req() req: AuthRequest, @Param("id") id: string) { return this.minutes.history(req.actor, uuid(id)); }
  @Post("minutes/:id/duplicate") @RequireRoles("Administrador", "Dispatcher") async duplicate(@Req() req: AuthRequest, @Param("id") id: string) { const original = await this.minutes.get(req.actor, uuid(id)); return this.commands.execute(new SaveMinute(req.actor, null, original.data)); }
  @Get("minutes/:id/pdf") async pdf(@Req() req: AuthRequest, @Param("id") id: string, @Res() res: Response) {
    const minute = await this.minutes.get(req.actor, uuid(id));
    const park = await this.database.query("SELECT name FROM parks WHERE id=$1 AND company_id=$2", [minute.park_id, req.actor.companyId]);
    const files = await this.database.query("SELECT name,version FROM attachments WHERE minute_id=$1 AND company_id=$2 AND deleted_at IS NULL", [id, req.actor.companyId]);
    const pdf = await generatePdf(minute, park.rows[0].name, files.rows as { name: string; version: number }[]);
    await this.storage.put(`${req.actor.companyId}/minutes/${id}/pdf/v${minute.version}.pdf`, pdf, "application/pdf");
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="ATA-S${minute.week}-v${minute.version}.pdf"`, "Cache-Control": "no-store" }).send(pdf);
  }
  @Post("minutes/:id/send") @RequireRoles("Administrador", "Dispatcher") @HttpCode(202) send(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key: string) { const input = sendInput.parse(body); return this.delivery.enqueue(req.actor, uuid(id), input.version, input.recipients, uuid(key)); }
  @Get("minutes/:id/deliveries") async deliveries(@Req() req: AuthRequest, @Param("id") id: string) { await this.minutes.get(req.actor, uuid(id)); return (await this.database.query("SELECT id,version,kind,state,attempts,last_error,created_at,completed_at FROM delivery_jobs WHERE minute_id=$1 AND company_id=$2 ORDER BY created_at DESC", [id, req.actor.companyId])).rows; }
  @Get("minutes/:id/attachments") async attachments(@Req() req: AuthRequest, @Param("id") id: string) { await this.minutes.get(req.actor, uuid(id)); return (await this.database.query("SELECT id,name,size,mime,version,sha256,created_at FROM attachments WHERE minute_id=$1 AND company_id=$2 AND deleted_at IS NULL ORDER BY name,version DESC", [id, req.actor.companyId])).rows; }
  @Post("minutes/:id/attachments") @RequireRoles("Administrador", "Dispatcher") @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 15 * 1024 * 1024, files: 1 } })) async upload(@Req() req: AuthRequest, @Param("id") id: string, @UploadedFile() file: Express.Multer.File, @Headers("if-match") match: string) {
    const minute = await this.minutes.get(req.actor, uuid(id));
    if (!file || !allowedFile(file.originalname) || !fileMatches(file.originalname, file.buffer)) throw new BadRequestException("Arquivo ou assinatura inválida");
    if (minute.version !== version(match)) throw new BadRequestException("Versão desatualizada");
    const safeName = file.originalname.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 200);
    const key = `${req.actor.companyId}/minutes/${id}/attachments/${randomUUID()}`;
    const mimeTypes: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", csv: "text/csv", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
    const mime = mimeTypes[safeName.split(".").pop()!.toLowerCase()];
    await this.storage.put(key, file.buffer, mime);
    return this.database.transaction(async client => {
      const updated = await client.query<MinuteRecord>("UPDATE minutes SET version=version+1,status='Rascunho',updated_at=now() WHERE id=$1 AND company_id=$2 AND version=$3 AND deleted_at IS NULL RETURNING *", [id, req.actor.companyId, minute.version]);
      if (!updated.rows[0]) throw new BadRequestException("Ata alterada durante upload. Tente novamente.");
      const result = await client.query("INSERT INTO attachments(company_id,minute_id,name,size,mime,blob_key,sha256,version) VALUES($1,$2,$3,$4,$5,$6,$7,(SELECT coalesce(max(version),0)+1 FROM attachments WHERE minute_id=$2 AND company_id=$1 AND name=$3)) RETURNING id,name,size,mime,version", [req.actor.companyId, id, safeName, file.size, mime, key, createHash("sha256").update(file.buffer).digest("hex")]);
      await auditVersion(client, updated.rows[0], req.actor, `Anexo incluído: ${safeName}`);
      return { ...result.rows[0], minuteVersion: updated.rows[0].version };
    });
  }
  @Get("minutes/:id/attachments/:fileId") async download(@Req() req: AuthRequest, @Param("id") id: string, @Param("fileId") fileId: string, @Res() res: Response) {
    await this.minutes.get(req.actor, uuid(id));
    const file = (await this.database.query("SELECT * FROM attachments WHERE id=$1 AND minute_id=$2 AND company_id=$3 AND deleted_at IS NULL", [uuid(fileId), id, req.actor.companyId])).rows[0];
    if (!file) throw new NotFoundException();
    res.set({ "Content-Type": file.mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`, "Cache-Control": "no-store" }).send(await this.storage.get(file.blob_key));
  }
  @Delete("minutes/:id/attachments/:fileId") @RequireRoles("Administrador", "Dispatcher") @HttpCode(204) async deleteAttachment(@Req() req: AuthRequest, @Param("id") id: string, @Param("fileId") fileId: string, @Headers("if-match") match: string) {
    await this.database.transaction(async client => {
      const minute = await client.query<MinuteRecord>("UPDATE minutes SET version=version+1,status='Rascunho',updated_at=now() WHERE id=$1 AND company_id=$2 AND version=$3 AND deleted_at IS NULL RETURNING *", [uuid(id), req.actor.companyId, version(match)]);
      if (!minute.rows[0]) throw new BadRequestException("Versão desatualizada ou ata indisponível");
      const file = await client.query("UPDATE attachments SET deleted_at=now() WHERE id=$1 AND minute_id=$2 AND company_id=$3 AND deleted_at IS NULL RETURNING name", [uuid(fileId), id, req.actor.companyId]);
      if (!file.rowCount) throw new NotFoundException();
      await auditVersion(client, minute.rows[0], req.actor, `Anexo removido: ${file.rows[0].name}`);
    });
  }
  @Post("minutes/:id/ai") @RequireRoles("Administrador", "Dispatcher") @HttpCode(200) async ai(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: unknown) { const { mode } = z.object({ mode: z.enum(["summary", "correction", "risks", "recommendations"]) }).strict().parse(body); const minute = await this.minutes.get(req.actor, uuid(id)); const content = minute.data.sections.map(section => `${section.title}: ${section.content.replace(/<[^>]*>/g, " ")}`).join("\n").slice(0, 50000); const result = await this.integrations.ai(mode, content); await this.database.query("INSERT INTO audit_events(company_id,actor_id,entity_id,action,details) VALUES($1,$2,$3,'AI_REQUEST',$4)", [req.actor.companyId, req.actor.id, id, { mode }]); return result; }
  @Get("dashboard") async dashboard(@Req() req: AuthRequest) {
    const company = req.actor.companyId;
    const totals = (await this.database.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE status='Enviada')::int AS sent,count(*) FILTER(WHERE status='Pendente')::int AS pending,count(*) FILTER(WHERE status='Rascunho')::int AS drafts FROM minutes WHERE company_id=$1 AND deleted_at IS NULL", [company])).rows[0];
    const byPark = (await this.database.query("SELECT p.id,p.name,p.region,count(m.id)::int AS total FROM parks p LEFT JOIN minutes m ON m.park_id=p.id AND m.company_id=p.company_id AND m.deleted_at IS NULL WHERE p.company_id=$1 AND p.deleted_at IS NULL GROUP BY p.id,p.company_id ORDER BY total DESC", [company])).rows;
    const weekly = (await this.database.query("SELECT date_trunc('week',meeting_date)::date AS week,count(*)::int AS total,count(*) FILTER(WHERE status='Enviada')::int AS sent FROM minutes WHERE company_id=$1 AND deleted_at IS NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 12", [company])).rows;
    const dispatchers = (await this.database.query("SELECT dispatcher,count(*)::int AS total FROM minutes WHERE company_id=$1 AND deleted_at IS NULL GROUP BY dispatcher", [company])).rows;
    return { totals, byPark, weekly, dispatchers };
  }
}