import { ResourceContainer, StoreAmount } from 'utils/RoomUtils';

export type StoreId = Id<ResourceContainer>;

interface RoomIntents {
  outflow: Map<StoreId, Map<ResourceConstant, StoreAmount>>;
  inflow: Map<StoreId, StoreAmount>;
  actors: Set<StoreId>;
}

// Transfer intents registered this tick, grouped by the room they happen in.
export class Ledger {
  private tick: Game['time'] = -1;
  private readonly rooms = new Map<Room['name'], RoomIntents>();

  // Amount of a resource already removed from a store this tick.
  Outflow(roomName: Room['name'], id: StoreId, resourceType: ResourceConstant): StoreAmount {
    return this.current().get(roomName)?.outflow.get(id)?.get(resourceType) ?? 0;
  }

  // Amount already added to a store this tick.
  Inflow(roomName: Room['name'], id: StoreId): StoreAmount {
    return this.current().get(roomName)?.inflow.get(id) ?? 0;
  }

  // Whether this creep's one transfer-family intent is already registered this tick.
  HasActed(roomName: Room['name'], actorId: StoreId): boolean {
    return this.current().get(roomName)?.actors.has(actorId) ?? false;
  }

  RecordIntent(
    roomName: Room['name'],
    actorId: StoreId,
    sourceId: StoreId,
    destId: StoreId,
    resourceType: ResourceConstant,
    amount: StoreAmount,
  ): void {
    const intents = this.intentsIn(roomName);
    const outflow = intents.outflow.get(sourceId) ?? new Map<ResourceConstant, StoreAmount>();
    outflow.set(resourceType, (outflow.get(resourceType) ?? 0) + amount);
    intents.outflow.set(sourceId, outflow);
    intents.inflow.set(destId, (intents.inflow.get(destId) ?? 0) + amount);
    intents.actors.add(actorId);
  }

  // Creeps read start-of-tick stores, so everything resets when the tick changes.
  private current(): Map<Room['name'], RoomIntents> {
    if (this.tick !== Game.time) {
      this.tick = Game.time;
      this.rooms.clear();
    }
    return this.rooms;
  }

  private intentsIn(roomName: Room['name']): RoomIntents {
    const rooms = this.current();
    let intents = rooms.get(roomName);
    if (intents === undefined) {
      intents = { outflow: new Map(), inflow: new Map(), actors: new Set() };
      rooms.set(roomName, intents);
    }
    return intents;
  }
}
