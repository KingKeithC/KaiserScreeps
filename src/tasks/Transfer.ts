import { CreepExtra } from 'Creep';
import type { RoomExtra } from 'Room';
import { RegisterTask } from 'tasks/types';
import { ResourceContainerUsedRatio, RoomPositionString, Sorts } from 'utils/Collections';
import { ClosestByPath } from 'utils/CreepUtils';
import { Ledger, StoreId } from 'logistics/Ledger';
import { ResourceContainer } from 'utils/RoomUtils';
import { TargetTask } from './TargetTask';

/** A positive quantity moves resources from the creep into the target; a negative one moves them out. */
export type TransferEntry = [resourceType: ResourceConstant, quantity: number];

interface TransferLeg {
  resourceType: ResourceConstant;
  quantity: number;
  moved: number;
}

type TransferArg = RoomPosition | RoomPositionString | TransferEntry;

export interface CollectRequest {
  collect: ResourceConstant[];
  sameRoom?: boolean;
  minAmount?: number;
}

// Caps each leg; finite so it survives Memory serialization.
export const MAX_TRANSFER_QUANTITY = 10_000;
const DEFAULT_ENTRIES: TransferEntry[] = [[RESOURCE_ENERGY, MAX_TRANSFER_QUANTITY]];

/* ------------- Helpers ------------- */

function canReceive(target: ResourceContainer): boolean {
  return !(target instanceof Resource || target instanceof Ruin || target instanceof Tombstone);
}

function storedOf(target: ResourceContainer, resourceType: ResourceConstant): number {
  if (target instanceof Resource) return target.amount;
  return target.store.getUsedCapacity(resourceType) ?? 0;
}

function freeOf(target: ResourceContainer, resourceType: ResourceConstant): number {
  if (target instanceof Resource) return 0;
  return target.store.getFreeCapacity(resourceType) ?? 0;
}

function leadingPosition(args: TransferArg[]): RoomPosition | RoomPositionString | undefined {
  const [first] = args;
  return typeof first === 'string' || first instanceof RoomPosition ? first : undefined;
}

function trailingEntries(args: TransferArg[]): TransferEntry[] {
  return (leadingPosition(args) === undefined ? args : args.slice(1)) as TransferEntry[];
}

function makeLeg(target: ResourceContainer, [resourceType, quantity]: TransferEntry): TransferLeg {
  if (Number.isNaN(quantity)) throw new Error(`Transfer of ${resourceType} needs a numeric quantity.`);
  if (quantity > 0 && !canReceive(target)) throw new Error(`Cannot transfer ${resourceType} into ${target}.`);
  const magnitude = Math.min(Math.abs(quantity), MAX_TRANSFER_QUANTITY);
  return { resourceType, quantity: Math.sign(quantity) * magnitude, moved: 0 };
}

// Units this leg can still move this tick; 0 when it is finished or blocked by intents already registered.
function plannedAmount(leg: TransferLeg, creep: CreepExtra, target: ResourceContainer, ledger: Ledger): number {
  const remaining = Math.abs(leg.quantity) - leg.moved;
  if (remaining <= 0) return 0;

  const giving = leg.quantity > 0;
  const available = giving
    ? creep.UsedCapacity(leg.resourceType)
    : storedOf(target, leg.resourceType) - ledger.Outflow(target.pos.roomName, target.id, leg.resourceType);
  const space = giving
    ? freeOf(target, leg.resourceType) - ledger.Inflow(target.pos.roomName, target.id)
    : creep.FreeCapacity(leg.resourceType);
  const amount = Math.max(0, Math.min(available, space));

  // Piles cannot be partially picked up, so the quantity only decides whether the leg is still active.
  if (!giving && target instanceof Resource) return amount;
  return Math.min(remaining, amount);
}

// Taking from a creep spends that creep's transfer slot, not ours.
function actorIdOf(creep: CreepExtra, target: ResourceContainer, leg: TransferLeg): StoreId {
  return (leg.quantity < 0 && target instanceof Creep ? target : creep).id;
}

function performIntent(
  creep: CreepExtra,
  target: ResourceContainer,
  leg: TransferLeg,
  amount: number,
): ScreepsReturnCode {
  if (leg.quantity > 0) return creep.transfer(target as Structure | Creep, leg.resourceType, amount);
  if (target instanceof Creep) return target.transfer(creep, leg.resourceType, amount);
  if (target instanceof Resource) return creep.pickup(target);
  return creep.withdraw(target as Structure | Ruin | Tombstone, leg.resourceType, amount);
}

/**
 * Current room first (closest by path), then the assigned room, its claims, and finally anywhere else.
 * Remote tiers are ranked by `rankRemote`.
 */
function pickByLocation<T extends ResourceContainer>(
  creep: CreepExtra,
  items: T[],
  rankRemote: (tier: T[]) => T | undefined,
): T | null {
  const claims = creep.AssignedRoom.WorkableAreaRoomNames;
  const tiers: T[][] = [[], [], [], []];
  for (const item of items) {
    const roomName = item.pos.roomName;
    const tier =
      roomName === creep.room.name ? 0 : roomName === creep.AssignedRoom.name ? 1 : claims.includes(roomName) ? 2 : 3;
    tiers[tier].push(item);
  }
  return ClosestByPath(creep, tiers[0]) ?? rankRemote(tiers[1]) ?? rankRemote(tiers[2]) ?? rankRemote(tiers[3]) ?? null;
}

export class Transfer extends TargetTask<ResourceContainer> {
  static readonly action = '🔁' as const;

  static {
    RegisterTask(this);
  }

  protected static override readonly minRangeToAct = 1;

  // prettier-ignore
  /** Structures to supply, in priority order, with the number of suppliers each allows at once. */
  static readonly SupplyPriorities: ((s: (AnyStoreStructure | Creep)) => boolean)[] = [
    s => s instanceof StructureExtension,
    s => s instanceof StructureSpawn,
    s => s instanceof StructureTower,
    () => true,
  ];

  public readonly legs: TransferLeg[];

  public constructor(target: ResourceContainer, ...transfers: TransferEntry[]);
  public constructor(
    target: ResourceContainer,
    position: RoomPosition | RoomPositionString,
    ...transfers: TransferEntry[]
  );
  public constructor(target: ResourceContainer, ...args: TransferArg[]) {
    super(target, 1, leadingPosition(args));
    const entries = trailingEntries(args);
    this.legs = (entries.length > 0 ? entries : DEFAULT_ENTRIES).map(entry => makeLeg(target, entry));
  }

  /** Withdraw energy from storage, but only while it holds more than the room's wartime buffer. */
  public static fromStorage(roomOrCreep: RoomExtra | CreepExtra): Transfer | null {
    const room = roomOrCreep instanceof Room ? roomOrCreep : roomOrCreep.AssignedRoom;
    if (
      room.storage !== undefined &&
      room.storage.store.getUsedCapacity(RESOURCE_ENERGY) > room.StorageWartimeEnergyBuffer
    )
      return new Transfer(room.storage, [RESOURCE_ENERGY, -MAX_TRANSFER_QUANTITY]);
    return null;
  }

  /** Deposit one carried resource type into storage. */
  public static stash(creep: CreepExtra, storage: StructureStorage): Transfer | null {
    if (storage.store.getFreeCapacity() === 0) return null;
    for (const resourceType in creep.store)
      if (creep.UsedCapacity(resourceType as ResourceConstant) > 0)
        return new Transfer(storage, [resourceType as ResourceConstant, MAX_TRANSFER_QUANTITY]);
    return null;
  }

  /**
   * Deposit into the first priority group with room and under its supplier cap, or collect via a `CollectRequest`.
   * Both pick by location: current room, assigned room, its claims, then anywhere else.
   */
  public static supply(
    creep: CreepExtra,
    candidatesOrRequest: (Creep | AnyStoreStructure)[] | CollectRequest,
  ): Transfer | null {
    if (!Array.isArray(candidatesOrRequest)) {
      const { collect: resources, sameRoom = false, minAmount = 0 } = candidatesOrRequest;
      const logistics = creep.colony.Logistics;
      for (const resourceType of resources) {
        if (creep.FreeCapacity(resourceType) <= 0) continue;

        const available = new Map<string, number>();
        const sources: ResourceContainer[] = [];
        for (const [source, amount] of logistics.Sources(creep.AssignedRoom.WorkableAreaRoomNames, resourceType)) {
          if (minAmount > 0 && amount < minAmount) continue;
          if (sameRoom && source.pos.roomName !== creep.AssignedRoom.name) continue;
          const left =
            amount -
            logistics.ledger.Outflow(source.pos.roomName, source.id, resourceType) -
            logistics.ReservedCapacity(source.pos.roomName, source.id);
          if (left <= 0) continue;
          available.set(source.id, left);
          sources.push(source);
        }

        const fullest = (tier: ResourceContainer[]): ResourceContainer | undefined =>
          [...tier].sort((a, b) => (available.get(a.id) ?? 0) - (available.get(b.id) ?? 0)).pop();

        const transfer = Transfer.pick(creep, resourceType, -1, sources, fullest);
        if (transfer) return transfer;
      }
      return null;
    }

    if (!creep.HasEnergy) return null;

    const suppliersByTarget = new Map<string, number>();
    for (const task of [...creep.AssignedRoom.AssignedTasks(Transfer, creep)]) {
      suppliersByTarget.set(task.targetId, (suppliersByTarget.get(task.targetId) ?? 0) + 1);
    }

    const ledger = creep.colony.Logistics.ledger;
    for (const matcher of Transfer.SupplyPriorities) {
      const group = candidatesOrRequest.filter(
        s =>
          s.store.getFreeCapacity(RESOURCE_ENERGY) - ledger.Inflow(s.pos.roomName, s.id) > 0 &&
          matcher(s) &&
          (suppliersByTarget.get(s.id) ?? 0) === 0,
      );
      const transfer = Transfer.pick(creep, RESOURCE_ENERGY, 1, group, tier =>
        [...tier].sort(Sorts.StoreEnergyRatioAsc).pop(),
      );
      if (transfer) return transfer;
    }
    return null;
  }

  // `direction` is 1 to deposit into the chosen target and -1 to take from it; takes reserve the creep's room.
  private static pick<T extends ResourceContainer>(
    creep: CreepExtra,
    resourceType: ResourceConstant,
    direction: 1 | -1,
    candidates: T[],
    rankRemote: (tier: T[]) => T | undefined,
  ): Transfer | null {
    const target = pickByLocation(creep, candidates, rankRemote);
    if (!target) return null;
    if (direction < 0) creep.colony.Logistics.Reserve(target.pos.roomName, target.id, creep.FreeCapacity(resourceType));
    return new Transfer(target, [resourceType, direction * MAX_TRANSFER_QUANTITY]);
  }

  /** Whether any leg takes resources out of the target, which counts as collection for reservations. */
  public get hasTake(): boolean {
    return this.legs.some(leg => leg.quantity < 0);
  }

  private nextMove(creep: CreepExtra, target: ResourceContainer): { leg: TransferLeg; amount: number } | undefined {
    const ledger = creep.colony.Logistics.ledger;
    for (const leg of this.legs) {
      const amount = plannedAmount(leg, creep, target, ledger);
      if (amount > 0) return { leg, amount };
    }
    return undefined;
  }

  protected isIntentBlocked(creep: CreepExtra, target: ResourceContainer): boolean {
    const next = this.nextMove(creep, target);
    if (!next) return true;
    return creep.colony.Logistics.ledger.HasActed(creep.pos.roomName, actorIdOf(creep, target, next.leg));
  }

  protected registerIntent(creep: CreepExtra, target: ResourceContainer): ScreepsReturnCode {
    const next = this.nextMove(creep, target);
    if (!next) return ERR_NOT_ENOUGH_RESOURCES; // Only reachable if the plan changed since isIntentBlocked.

    const result = performIntent(creep, target, next.leg, next.amount);
    if (result === ERR_FULL || result === ERR_NOT_ENOUGH_RESOURCES) {
      // The snapshot disagreed with the engine: drop this leg and report a no-op rather than retry.
      next.leg.moved = Math.abs(next.leg.quantity);
      return ERR_NOT_ENOUGH_RESOURCES;
    }
    if (result === OK) {
      next.leg.moved += next.amount;
      const giving = next.leg.quantity > 0;
      const sourceId: StoreId = giving ? creep.id : target.id;
      const destId: StoreId = giving ? target.id : creep.id;
      creep.colony.Logistics.ledger.RecordIntent(
        creep.pos.roomName,
        actorIdOf(creep, target, next.leg),
        sourceId,
        destId,
        next.leg.resourceType,
        next.amount,
      );
    }
    return result;
  }

  public isCreepAbleToContinue(): boolean {
    return this.legs.some(leg => Math.abs(leg.quantity) > leg.moved);
  }

  public isCompleteWhenTargetValid(creep: CreepExtra, target: ResourceContainer): boolean {
    return this.nextMove(creep, target) === undefined;
  }

  public extraToString(target: ResourceContainer): string {
    const legs = this.legs.map(leg => `${leg.resourceType} ${leg.moved}/${leg.quantity}`);
    return `${legs.join(', ')}, %${ResourceContainerUsedRatio(target)} stored`;
  }
}
