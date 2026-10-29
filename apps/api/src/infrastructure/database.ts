import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

@Injectable()
export class Database implements OnModuleDestroy {
  private readonly pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 });
  query<Row extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) { return this.pool.query<Row>(sql, params); }
  async transaction<Result>(run: (client: PoolClient) => Promise<Result>) {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); const result = await run(client); await client.query("COMMIT"); return result; } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async onModuleDestroy() { await this.pool.end(); }
}