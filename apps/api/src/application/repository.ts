import type { Actor, ListInput, MinuteData, MinuteRecord } from "../domain/minute";

export abstract class MinutesRepository {
  abstract list(actor: Actor, filters: ListInput): Promise<{ items: MinuteRecord[]; total: number; page: number; limit: number }>;
  abstract get(actor: Actor, id: string): Promise<MinuteRecord>;
  abstract save(actor: Actor, id: string | null, input: MinuteData, version?: number): Promise<MinuteRecord>;
  abstract remove(actor: Actor, id: string, version: number): Promise<void>;
  abstract history(actor: Actor, id: string): Promise<unknown[]>;
}