import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import type { Actor, MinuteRecord } from "../domain/minute";
import { isReady } from "../domain/minute";
import { Database } from "../infrastructure/database";
import { auditVersion } from "../infrastructure/minutes.repository";
import { Integrations, type DeliverySnapshot } from "../infrastructure/integrations";

@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);
  constructor(@Inject(Database) private readonly database: Database, @Inject(Integrations) private readonly integrations: Integrations) {}
  async enqueue(actor: Actor, id: string, version: number, recipients: string[], key: string) {
    return this.database.transaction(async client => {
      const result = await client.query<MinuteRecord>("SELECT * FROM minutes WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR UPDATE", [id, actor.companyId]);
      if (!result.rows[0]) throw new NotFoundException("Ata não encontrada");
      const existing = await client.query("SELECT id,state,minute_id FROM delivery_jobs WHERE company_id=$1 AND idempotency_key=$2 AND kind='EMAIL'", [actor.companyId, key]);
      if (existing.rows[0]) { if (existing.rows[0].minute_id !== id) throw new ConflictException("Chave de idempotência já utilizada em outra ata"); return existing.rows[0]; }
      const minute = result.rows[0];
      if (minute.version !== version) throw new ConflictException("Versão desatualizada");
      if (!isReady(minute.data)) throw new BadRequestException("Checklist, participantes e conteúdo obrigatórios");
      const inFlight = await client.query("SELECT 1 FROM delivery_jobs WHERE minute_id=$1 AND company_id=$2 AND kind='EMAIL' AND state IN ('PENDING','PROCESSING','UNCERTAIN')", [id, actor.companyId]);
      if (inFlight.rowCount) throw new ConflictException("Já existe envio em processamento ou aguardando conferência");
      const attachments = await client.query("SELECT name,blob_key,mime,version,size FROM attachments WHERE minute_id=$1 AND company_id=$2 AND deleted_at IS NULL", [id, actor.companyId]);
      if (attachments.rows.reduce((total, file) => total + Number(file.size), 0) > 2 * 1024 * 1024) throw new BadRequestException("Envio direto suporta até 2 MB de anexos. Use links para documentos maiores.");
      const park = await client.query("SELECT name FROM parks WHERE id=$1 AND company_id=$2", [minute.park_id, actor.companyId]);
      const updated = (await client.query<MinuteRecord>("UPDATE minutes SET status='Pendente',version=version+1,updated_at=now() WHERE id=$1 AND company_id=$2 RETURNING *", [id, actor.companyId])).rows[0];
      await auditVersion(client, updated, actor, "Envio solicitado");
      const snapshot: DeliverySnapshot = { minute: updated, parkName: park.rows[0].name, recipients, attachments: attachments.rows as DeliverySnapshot["attachments"] };
      return (await client.query("INSERT INTO delivery_jobs(company_id,minute_id,version,kind,idempotency_key,payload) VALUES($1,$2,$3,'EMAIL',$4,$5) RETURNING id,state", [actor.companyId, id, updated.version, key, snapshot])).rows[0];
    });
  }
  @Interval(5000)
  async process() {
    if (process.env.WORKER_ENABLED !== "true") return;
    try {
      await this.database.query("UPDATE delivery_jobs SET state='UNCERTAIN',last_error='Worker interrompido. Conferir entrega antes de reenviar.' WHERE state='PROCESSING' AND locked_until<now()");
      const job = await this.database.transaction(async client => {
        const result = await client.query("SELECT * FROM delivery_jobs WHERE state='PENDING' AND available_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1");
        if (!result.rows[0]) return null;
        await client.query("UPDATE delivery_jobs SET state='PROCESSING',attempts=attempts+1,locked_until=now()+interval '10 minutes' WHERE id=$1", [result.rows[0].id]);
        return result.rows[0] as { id: string; company_id: string; minute_id: string; version: number; kind: string; payload: DeliverySnapshot; idempotency_key: string };
      });
      if (!job) return;
      try {
        if (job.kind === "EMAIL") await this.integrations.email(job.payload, job.id); else await this.integrations.teams(job.payload);
        await this.database.transaction(async client => {
          await client.query("UPDATE delivery_jobs SET state='SENT',completed_at=now(),locked_until=NULL WHERE id=$1", [job.id]);
          if (job.kind === "EMAIL") {
            const result = await client.query<MinuteRecord>("UPDATE minutes SET status='Enviada',version=version+1,updated_at=now() WHERE id=$1 AND company_id=$2 AND version=$3 AND deleted_at IS NULL RETURNING *", [job.minute_id, job.company_id, job.version]);
            if (result.rows[0]) await auditVersion(client, result.rows[0], { companyId: job.company_id, id: null as unknown as string, name: "Serviço de distribuição", role: "Administrador" }, "Microsoft Graph aceitou o envio");
            if (process.env.TEAMS_TEAM_ID && process.env.TEAMS_CHANNEL_ID) await client.query("INSERT INTO delivery_jobs(company_id,minute_id,version,kind,idempotency_key,payload) VALUES($1,$2,$3,'TEAMS',$4,$5) ON CONFLICT DO NOTHING", [job.company_id, job.minute_id, job.version, job.idempotency_key, job.payload]);
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha desconhecida";
        await this.database.query("UPDATE delivery_jobs SET state='UNCERTAIN',last_error=$2,locked_until=NULL WHERE id=$1", [job.id, message.slice(0, 500)]);
        this.logger.error(`Delivery ${job.id} requires operator review`);
      }
    } catch { this.logger.error("Delivery worker unavailable"); }
  }
}