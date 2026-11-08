import { CreepExtra } from 'Creep';
import type { RoomExtra } from 'Room';
import { RegisterTask, TaskActionResult } from 'tasks/types';
import { ResourceContainerUsedRatio, RoomPositionString, Sorts } from 'utils/Collections';
import { ClosestByPath } from 'utils/CreepUtils';
import { Ledger, StoreId } from 'logistics/Ledger';
import { ContainerAndAmount, ResourceContainer } from 'utils/RoomUtils';
import { TargetTask } from './TargetTask';

/** A positive quantity moves resources from the creep into the target; a negative one moves them out. */
export type TransferEntry = [resourceType: ResourceConstant, quantity: number];

interface TransferLeg {
  resourceType: ResourceConstant;
  quantity: number;
  moved: number;
}

type TransferArg = RoomPosition | RoomPositionString | TransferEntry;

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
  const source: ResourceContainer = giving ? creep : target;
  const dest: ResourceContainer = giving ? target : creep;
  const available =
    storedOf(source, leg.resourceType) - ledger.Outflow(source.pos.roomName, source.id, leg.resourceType);
  const space = freeOf(dest, leg.resourceType) - ledger.Inflow(dest.pos.roomName, dest.id);
  const amount = Math.max(0, Math.min(available, space));

  // Piles cannot be partially picked up, so the quantity only decides whether the leg is still active.
  if (!giving && target instanceof Resource) return amount;
  return Math.min(remaining, amount);
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
 * Picks the source to collect from. Prefers a source that can fully fill the creep: the closest in our room,
 * otherwise the fullest anywhere. Failing that, takes the closest reachable source unless restricted to our room.
 */
function bestSource(creep: CreepExtra, sources: ContainerAndAmount[], sameRoom: boolean): ResourceContainer | null {
  const freeCapacity = creep.store.getFreeCapacity();
  const adjusted: ContainerAndAmount[] = sources.map(([source, amount]) => [
    source,
    amount - creep.colony.Logistics.ReservedCapacity(source.pos.roomName, source.id) - freeCapacity,
  ]);

  const fullSupply = adjusted.filter(([, amount]) => amount >= freeCapacity);
  fullSupply.sort(Sorts.NumberPairValueAsc);
  const fullestSources = fullSupply.map(([source]) => source);
  const fullestInRoom = ClosestByPath(creep, fullestSources);
  if (fullestInRoom) return fullestInRoom;
  if (!sameRoom) {
    const fullestAnywhere = fullestSources.pop();
    if (fullestAnywhere) return fullestAnywhere;
  }

  adjusted.sort(Sorts.NumberPairValueAsc);
  const closest = ClosestByPath(
    creep,
    adjusted.map(([source]) => source),
  );
  if (closest) return closest;
  if (!sameRoom) return adjusted.map(([source]) => source).pop() ?? null;
  return null;
}

export class Transfer extends TargetTask<ResourceContainer> {
  static readonly action = '🔁' as const;

  static {
    RegisterTask(this);
  }

  protected static override readonly minRangeToAct = 1;

  // prettier-ignore
  /** Structures to supply, in priority order, with the number of suppliers each allows at once. */
  static readonly SupplyPriorities: [matches: (s: AnyStoreStructure) => boolean, maxSuppliers: number][] = [
    [s => s instanceof StructureExtension, 1],
    [s => s instanceof StructureSpawn, 1],
    [s => s instanceof StructureTower, 1],
    [() => true, 1],
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

  /**
   * Collect the first of `resources` that has a usable source, taking from the best one.
   * Reserves the chosen source so collectors later this tick see its amount as taken.
   */
  public static collectFrom(
    creep: CreepExtra,
    resources: ResourceConstant[],
    options: { sameRoom?: boolean; minAmount?: number } = {},
  ): Transfer | null {
    const { sameRoom = false, minAmount = 0 } = options;
    const logistics = creep.colony.Logistics;
    for (const resourceType of resources) {
      const candidates = logistics
        .Sources(creep.AssignedRoom.WorkableAreaRoomNames, resourceType)
        .filter(([, amount]) => minAmount === 0 || amount >= minAmount);
      const source = bestSource(creep, candidates, sameRoom);
      if (!source) continue;

      logistics.Reserve(source.pos.roomName, source.id, creep.store.getFreeCapacity(resourceType) ?? 0);
      return new Transfer(source, [resourceType, -MAX_TRANSFER_QUANTITY]);
    }
    return null;
  }

  /** Withdraw energy from storage, but only while it holds more than the room's wartime buffer. */
  public static fromStorage(room: RoomExtra): Transfer | null {
    const storage = room.storage;
    if (storage !== undefined && storage.store.getUsedCapacity(RESOURCE_ENERGY) > room.StorageWartimeEnergyBuffer)
      return new Transfer(storage, [RESOURCE_ENERGY, -MAX_TRANSFER_QUANTITY]);
    return null;
  }

  /** Deposit one carried resource type into storage. */
  public static stash(creep: CreepExtra, storage: StructureStorage): Transfer | null {
    for (const resourceType in creep.store)
      return new Transfer(storage, [resourceType as ResourceConstant, MAX_TRANSFER_QUANTITY]);
    return null;
  }

  /**
   * Supply the first priority group with a structure that has room for energy and is under its supplier cap.
   * Prefers the closest in our room, otherwise the emptiest remote one.
   */
  public static supply(
    creep: CreepExtra,
    candidates: AnyStoreStructure[],
    inProgress: Transfer[] = [...creep.AssignedRoom.AssignedTasks(Transfer)],
  ): Transfer | null {
    const suppliersByTarget = new Map<string, number>();
    for (const task of inProgress) {
      suppliersByTarget.set(task.targetId, (suppliersByTarget.get(task.targetId) ?? 0) + 1);
    }

    for (const [matches, maxSuppliers] of Transfer.SupplyPriorities) {
      const group = candidates.filter(
        s =>
          s.store.getFreeCapacity(RESOURCE_ENERGY) > 0 &&
          matches(s) &&
          (suppliersByTarget.get(s.id) ?? 0) < maxSuppliers,
      );
      const inRoom = ClosestByPath(
        creep,
        group.filter(s => s.room.name === creep.room.name),
      );
      if (inRoom) return new Transfer(inRoom);
      const remote = group
        .filter(s => s.room.name !== creep.room.name)
        .sort(Sorts.StoreEnergyRatioAsc)
        .pop();
      if (remote) return new Transfer(remote);
    }
    return null;
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

  public actWhenTargetValid(creep: CreepExtra, target: ResourceContainer): TaskActionResult | null {
    const ledger = creep.colony.Logistics.ledger;
    const next = this.nextMove(creep, target);
    if (!next) return null;

    // Taking from a creep spends that creep's transfer slot, not ours.
    const actor = next.leg.quantity < 0 && target instanceof Creep ? target : creep;
    if (ledger.HasActed(creep.pos.roomName, actor.id)) return null;

    const result = performIntent(creep, target, next.leg, next.amount);
    if (result === OK) {
      next.leg.moved += next.amount;
      const giving = next.leg.quantity > 0;
      const sourceId: StoreId = giving ? creep.id : target.id;
      const destId: StoreId = giving ? target.id : creep.id;
      ledger.RecordIntent(creep.pos.roomName, actor.id, sourceId, destId, next.leg.resourceType, next.amount);
    } else if (result === ERR_FULL || result === ERR_NOT_ENOUGH_RESOURCES) {
      // The snapshot disagreed with the engine, so this leg is dropped rather than retried.
      next.leg.moved = Math.abs(next.leg.quantity);
      return null;
    }
    return this.movementResult(result, target);
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
