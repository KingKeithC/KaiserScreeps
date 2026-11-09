import { ContainerAndAmount, ResourceContainer, StoreAmount, StoreTargetable } from 'utils/RoomUtils';
import { Ledger, StoreId } from './Ledger';

export type HolderRole = 'source' | 'store' | 'creep';

interface RoomStores {
  holders: Map<StoreId, HolderRole>;
  sources: Map<ResourceConstant, Map<StoreId, ContainerAndAmount>>;
}

function addSource(
  stores: RoomStores,
  resourceType: ResourceConstant,
  container: ResourceContainer,
  amount: StoreAmount,
): void {
  const bySource = stores.sources.get(resourceType) ?? new Map<StoreId, ContainerAndAmount>();
  bySource.set(container.id, [container, amount]);
  stores.sources.set(resourceType, bySource);
}

// Indexes every store per room once per tick, and tracks the capacity collectors have reserved.
export class LogisticsSystem {
  readonly ledger = new Ledger();

  private tick: Game['time'] = -1;
  private readonly rooms = new Map<Room['name'], RoomStores>();
  private readonly reserved = new Map<Room['name'], Map<StoreId, StoreAmount>>();

  BeginTick(roomNames: Room['name'][]): void {
    if (this.tick === Game.time) return;
    this.tick = Game.time;
    this.rooms.clear();
    this.reserved.clear();

    for (const name of roomNames) if (name in Game.rooms) this.IndexRoom(Game.rooms[name]);
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      this.storesIn(creep.pos.roomName).holders.set(creep.id, 'creep');
    }
  }

  // Every indexed store in a room, by role.
  Holders(roomName: Room['name']): ReadonlyMap<StoreId, HolderRole> {
    return this.storesIn(roomName).holders;
  }

  // Collectable sources of a resource in the given rooms, with their amounts at the start of the tick.
  Sources(roomNames: Room['name'][], resourceType: ResourceConstant): ContainerAndAmount[] {
    const found: ContainerAndAmount[] = [];
    for (const roomName of roomNames) {
      const sources = this.rooms.get(roomName)?.sources.get(resourceType);
      if (sources === undefined) continue;
      for (const entry of sources.values()) found.push(entry);
    }
    return found;
  }

  // Capacity already promised to collectors of a source this tick.
  ReservedCapacity(roomName: Room['name'], id: StoreId): StoreAmount {
    return this.reserved.get(roomName)?.get(id) ?? 0;
  }

  Reserve(roomName: Room['name'], id: StoreId, amount: StoreAmount): void {
    let reserved = this.reserved.get(roomName);
    if (reserved === undefined) {
      reserved = new Map();
      this.reserved.set(roomName, reserved);
    }
    reserved.set(id, (reserved.get(id) ?? 0) + amount);
  }

  private storesIn(roomName: Room['name']): RoomStores {
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
      if (pile.amount > 0) addSource(stores, pile.resourceType, pile, pile.amount);
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
      if (amount > 0) addSource(stores, resourceType as ResourceConstant, holder, amount);
    }
  }
}
