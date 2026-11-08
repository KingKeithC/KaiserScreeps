import { ResourceContainer } from 'utils/RoomUtils';

export type StoreId = Id<ResourceContainer>;

interface RoomIntents {
  outflow: Map<StoreId, Map<ResourceConstant, number>>;
  inflow: Map<StoreId, number>;
  actors: Set<StoreId>;
}

// Transfer intents registered this tick, grouped by the room they happen in.
export class Ledger {
  private tick = -1;
  private readonly rooms = new Map<string, RoomIntents>();

  // Amount of a resource already removed from a store this tick.
  Outflow(roomName: string, id: StoreId, resourceType: ResourceConstant): number {
    return this.current().get(roomName)?.outflow.get(id)?.get(resourceType) ?? 0;
  }

  // Amount already added to a store this tick.
  Inflow(roomName: string, id: StoreId): number {
    return this.current().get(roomName)?.inflow.get(id) ?? 0;
  }

  // Whether this creep's one transfer-family intent is already registered this tick.
  HasActed(roomName: string, actorId: StoreId): boolean {
    return this.current().get(roomName)?.actors.has(actorId) ?? false;
  }

  RecordIntent(
    roomName: string,
    actorId: StoreId,
    sourceId: StoreId,
    destId: StoreId,
    resourceType: ResourceConstant,
    amount: number,
  ): void {
    const intents = this.intentsIn(roomName);
    const outflow = intents.outflow.get(sourceId) ?? new Map<ResourceConstant, number>();
    outflow.set(resourceType, (outflow.get(resourceType) ?? 0) + amount);
    intents.outflow.set(sourceId, outflow);
    intents.inflow.set(destId, (intents.inflow.get(destId) ?? 0) + amount);
    intents.actors.add(actorId);
  }

  // Creeps read start-of-tick stores, so everything resets when the tick changes.
  private current(): Map<string, RoomIntents> {
    if (this.tick !== Game.time) {
      this.tick = Game.time;
      this.rooms.clear();
    }
    return this.rooms;
  }

  private intentsIn(roomName: string): RoomIntents {
    const rooms = this.current();
    let intents = rooms.get(roomName);
    if (intents === undefined) {
      intents = { outflow: new Map(), inflow: new Map(), actors: new Set() };
      rooms.set(roomName, intents);
    }
    return intents;
  }
}
