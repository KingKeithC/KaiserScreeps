import { ResourceContainer, StoreAmount } from 'utils/RoomUtils';

export type StoreId = Id<ResourceContainer>;

interface RoomIntents {
  outflow: Map<StoreId, Map<ResourceConstant, StoreAmount>>;
  inflow: Map<StoreId, Map<ResourceConstant, StoreAmount>>;
  actors: Set<StoreId>;
}

function sumAmounts(
  amounts: Map<ResourceConstant, StoreAmount> | undefined,
  resourceType?: ResourceConstant,
): StoreAmount {
  if (amounts === undefined) return 0;
  if (resourceType !== undefined) return amounts.get(resourceType) ?? 0;
  let total = 0;
  for (const amount of amounts.values()) total += amount;
  return total;
}

// Transfer intents registered this tick, grouped by the room they happen in.
export class Ledger {
  private tick: Game['time'] = -1;
  private readonly rooms = new Map<Room['name'], RoomIntents>();

  // Amount already removed from a store this tick; all resources when none is given.
  Outflow(roomName: Room['name'], id: StoreId, resourceType?: ResourceConstant): StoreAmount {
    return sumAmounts(this.current().get(roomName)?.outflow.get(id), resourceType);
  }

  // Amount already added to a store this tick; all resources when none is given.
  Inflow(roomName: Room['name'], id: StoreId, resourceType?: ResourceConstant): StoreAmount {
    return sumAmounts(this.current().get(roomName)?.inflow.get(id), resourceType);
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
    const inflow = intents.inflow.get(destId) ?? new Map<ResourceConstant, StoreAmount>();
    inflow.set(resourceType, (inflow.get(resourceType) ?? 0) + amount);
    intents.inflow.set(destId, inflow);
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
