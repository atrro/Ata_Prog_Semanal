import { Inject } from "@nestjs/common";
import { CommandHandler, QueryHandler, type ICommandHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { Actor, ListInput, MinuteData } from "../domain/minute";
import { MinutesRepository } from "./repository";

export class SaveMinute { constructor(public readonly actor: Actor, public readonly id: string | null, public readonly data: MinuteData, public readonly version?: number) {} }
export class ListMinutes { constructor(public readonly actor: Actor, public readonly filters: ListInput) {} }
@CommandHandler(SaveMinute)
export class SaveMinuteHandler implements ICommandHandler<SaveMinute> {
  constructor(@Inject(MinutesRepository) private readonly repository: MinutesRepository) {}
  execute(command: SaveMinute) { return this.repository.save(command.actor, command.id, command.data, command.version); }
}
@QueryHandler(ListMinutes)
export class ListMinutesHandler implements IQueryHandler<ListMinutes> {
  constructor(@Inject(MinutesRepository) private readonly repository: MinutesRepository) {}
  execute(query: ListMinutes) { return this.repository.list(query.actor, query.filters); }
}