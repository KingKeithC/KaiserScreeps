import { ContainerAndAmount, StoreTargetable } from 'utils/RoomUtils';
import { Ledger, StoreId } from './Ledger';

export type HolderRole = 'source' | 'store' | 'creep';

interface RoomStores {
  holders: Map<StoreId, HolderRole>;
  sources: Map<ResourceConstant, Map<StoreId, number>>;
}

function addSource(stores: RoomStores, resourceType: ResourceConstant, id: StoreId, amount: number): void {
  const bySource = stores.sources.get(resourceType) ?? new Map<StoreId, number>();
  bySource.set(id, amount);
  stores.sources.set(resourceType, bySource);
}

// Indexes every store per room once per tick, and tracks the capacity collectors have reserved.
export class LogisticsSystem {
  readonly ledger = new Ledger();

  private tick = -1;
  private readonly rooms = new Map<string, RoomStores>();
  private readonly reserved = new Map<string, Map<StoreId, number>>();

  BeginTick(roomNames: string[]): void {
    if (this.tick === Game.time) return;
    this.tick = Game.time;
    this.rooms.clear();
    this.reserved.clear();

    for (const name of roomNames) if (name in Game.rooms) this.IndexRoom(Game.rooms[name]);
    for (const creep of Object.values(Game.creeps)) this.storesIn(creep.pos.roomName).holders.set(creep.id, 'creep');
  }

  // Every indexed store in a room, by role.
  Holders(roomName: string): ReadonlyMap<StoreId, HolderRole> {
    return this.storesIn(roomName).holders;
  }

  // Collectable sources of a resource in the given rooms, with their amounts at the start of the tick.
  Sources(roomNames: string[], resourceType: ResourceConstant): ContainerAndAmount[] {
    const found: ContainerAndAmount[] = [];
    for (const roomName of roomNames) {
      const sources = this.rooms.get(roomName)?.sources.get(resourceType);
      if (sources === undefined) continue;
      for (const [id, amount] of sources) {
        const source = Game.getObjectById(id);
        if (source !== null) found.push([source, amount]);
      }
    }
    return found;
  }

  // Capacity already promised to collectors of a source this tick.
  ReservedCapacity(roomName: string, id: StoreId): number {
    return this.reserved.get(roomName)?.get(id) ?? 0;
  }

  Reserve(roomName: string, id: StoreId, amount: number): void {
    let reserved = this.reserved.get(roomName);
    if (reserved === undefined) {
      reserved = new Map();
      this.reserved.set(roomName, reserved);
    }
    reserved.set(id, (reserved.get(id) ?? 0) + amount);
  }

  private storesIn(roomName: string): RoomStores {
    let stores = this.rooms.get(roomName);
    if (stores === undefined) {
      stores = { holders: new Map(), sources: new Map() };
      this.rooms.set(roomName, stores);
    }
    return stores;
  }

  private IndexRoom(room: Room): void {
    const stores = this.storesIn(room.name);

    for (const pile of room.find(FIND_DROPPED_RESOURCES)) {
      stores.holders.set(pile.id, 'source');
      if (pile.amount > 0) addSource(stores, pile.resourceType, pile.id, pile.amount);
    }
    for (const tomb of room.find(FIND_TOMBSTONES)) this.IndexStore(stores, tomb, 'source');
    for (const ruin of room.find(FIND_RUINS)) this.IndexStore(stores, ruin, 'source');

    for (const structure of room.find(FIND_STRUCTURES)) {
      if (!('store' in structure)) continue;
      const store = structure as AnyStoreStructure;
      this.IndexStore(stores, store, store.structureType === STRUCTURE_CONTAINER ? 'source' : 'store');
    }
  }

  private IndexStore(stores: RoomStores, holder: StoreTargetable, role: HolderRole): void {
    stores.holders.set(holder.id, role);
    if (role !== 'source') return;
    for (const resourceType in holder.store) {
      const amount = holder.store.getUsedCapacity(resourceType as ResourceConstant) ?? 0;
      if (amount > 0) addSource(stores, resourceType as ResourceConstant, holder.id, amount);
    }
  }
}
