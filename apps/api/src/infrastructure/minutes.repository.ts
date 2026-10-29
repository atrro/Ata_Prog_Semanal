import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { MinutesRepository } from "../application/repository";
import type { Actor, ListInput, MinuteData, MinuteRecord } from "../domain/minute";
import { Database } from "./database";

export async function auditVersion(client: PoolClient, minute: MinuteRecord, actor: Actor, action: string) {
  const snapshot = JSON.stringify(minute);
  await client.query("INSERT INTO minute_versions(company_id, minute_id, version, actor_id, actor_name, action, snapshot, sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [actor.companyId, minute.id, minute.version, actor.id, actor.name, action, snapshot, createHash("sha256").update(snapshot).digest("hex")]);
}

@Injectable()
export class PgMinutesRepository extends MinutesRepository {
  constructor(@Inject(Database) private readonly database: Database) { super(); }
  async list(actor: Actor, filters: ListInput) {
    const params: unknown[] = [actor.companyId];
    const clauses = ["m.company_id=$1", "m.deleted_at IS NULL"];
    const add = (clause: string, value: unknown) => { params.push(value); clauses.push(clause.replace("?", `$${params.length}`)); };
    if (filters.parkId) add("m.park_id=?", filters.parkId);
    if (filters.week) add("m.week=?", filters.week);
    if (filters.dispatcher) add("m.dispatcher=?", filters.dispatcher);
    if (filters.region) add("p.region=?", filters.region);
    if (filters.status) add("m.status=?", filters.status);
    if (filters.from) add("m.meeting_date>=?", filters.from);
    if (filters.to) add("m.meeting_date<=?", filters.to);
    if (filters.search) { params.push(`%${filters.search.replace(/[\\%_]/g, "\\$&")}%`); clauses.push(`(p.name ILIKE $${params.length} OR m.dispatcher ILIKE $${params.length})`); }
    const where = clauses.join(" AND ");
    const count = await this.database.query<{ total: string }>(`SELECT count(*) AS total FROM minutes m JOIN parks p ON p.id=m.park_id AND p.company_id=m.company_id WHERE ${where}`, params);
    params.push(filters.limit, (filters.page - 1) * filters.limit);
    const result = await this.database.query<MinuteRecord>(`SELECT m.* FROM minutes m JOIN parks p ON p.id=m.park_id AND p.company_id=m.company_id WHERE ${where} ORDER BY m.meeting_date DESC,m.id LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { items: result.rows, total: Number(count.rows[0].total), page: filters.page, limit: filters.limit };
  }
  async get(actor: Actor, id: string) {
    const result = await this.database.query<MinuteRecord>("SELECT * FROM minutes WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL", [id, actor.companyId]);
    if (!result.rows[0]) throw new NotFoundException("Ata não encontrada");
    return result.rows[0];
  }
  async save(actor: Actor, id: string | null, input: MinuteData, version?: number) {
    return this.database.transaction(async client => {
      const park = await client.query("SELECT 1 FROM parks WHERE id=$1 AND company_id=$2 AND deleted_at IS NULL FOR SHARE", [input.parkId, actor.companyId]);
      if (!park.rowCount) throw new NotFoundException("Parque não encontrado");
      let minute: MinuteRecord;
      if (id) {
        const result = await client.query<MinuteRecord>("UPDATE minutes SET park_id=$3,week=$4,meeting_date=$5,dispatcher=$6,data=$7,version=version+1,status='Rascunho',updated_at=now() WHERE id=$1 AND company_id=$2 AND version=$8 AND deleted_at IS NULL RETURNING *", [id, actor.companyId, input.parkId, input.week, input.date, input.dispatcher, input, version]);
        if (!result.rows[0]) throw new ConflictException("Versão desatualizada ou ata indisponível. Recarregue antes de editar.");
        minute = result.rows[0];
      } else {
        const result = await client.query<MinuteRecord>("INSERT INTO minutes(company_id,park_id,week,meeting_date,dispatcher,data) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [actor.companyId, input.parkId, input.week, input.date, input.dispatcher, input]);
        minute = result.rows[0];
      }
      await auditVersion(client, minute, actor, id ? "Ata revisada" : "Ata criada");
      return minute;
    });
  }
  async remove(actor: Actor, id: string, version: number) {
    await this.database.transaction(async client => {
      const result = await client.query<MinuteRecord>("UPDATE minutes SET deleted_at=now(),updated_at=now(),version=version+1 WHERE id=$1 AND company_id=$2 AND version=$3 AND deleted_at IS NULL RETURNING *", [id, actor.companyId, version]);
      if (!result.rows[0]) throw new ConflictException("Versão desatualizada ou ata indisponível");
      await auditVersion(client, result.rows[0], actor, "Ata excluída logicamente");
    });
  }
  async history(actor: Actor, id: string) { await this.get(actor, id); return (await this.database.query("SELECT version,actor_name,action,created_at,sha256,snapshot FROM minute_versions WHERE minute_id=$1 AND company_id=$2 ORDER BY version DESC", [id, actor.companyId])).rows; }
}