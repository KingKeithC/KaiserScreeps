import { CreepExtra } from 'Creep';
import { RegisterTask, TaskActionResult } from 'tasks/types';
import { ResourceContainerUsedRatio, RoomPositionString } from 'utils/Collections';
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

// Infinity serializes to null in Memory, so unbounded quantities use this finite value.
const UNBOUNDED = Number.MAX_SAFE_INTEGER;
const DEFAULT_ENTRIES: TransferEntry[] = [[RESOURCE_ENERGY, Infinity]];

/* ------------- Tick ledger ------------- */

// Creeps read the store snapshot from the start of the tick, so intents registered this tick are tracked here.
interface TickLedger {
  tick: number;
  outflow: Map<string, Map<ResourceConstant, number>>;
  inflow: Map<string, number>;
  actors: Set<string>; // Creeps whose one transfer-family intent this tick is already registered.
}

const ledger: TickLedger = { tick: -1, outflow: new Map(), inflow: new Map(), actors: new Set() };

function currentLedger(): TickLedger {
  if (ledger.tick !== Game.time) {
    ledger.tick = Game.time;
    ledger.outflow.clear();
    ledger.inflow.clear();
    ledger.actors.clear();
  }
  return ledger;
}

function outflowOf(id: string, resourceType: ResourceConstant): number {
  return currentLedger().outflow.get(id)?.get(resourceType) ?? 0;
}

function inflowOf(id: string): number {
  return currentLedger().inflow.get(id) ?? 0;
}

function recordIntent(
  actorId: string,
  sourceId: string,
  destId: string,
  resourceType: ResourceConstant,
  amount: number,
): void {
  const { outflow, inflow, actors } = currentLedger();
  const byResource = outflow.get(sourceId) ?? new Map<ResourceConstant, number>();
  byResource.set(resourceType, (byResource.get(resourceType) ?? 0) + amount);
  outflow.set(sourceId, byResource);
  inflow.set(destId, (inflow.get(destId) ?? 0) + amount);
  actors.add(actorId);
}

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
  const magnitude = Math.min(Math.abs(quantity), UNBOUNDED);
  return { resourceType, quantity: Math.sign(quantity) * magnitude, moved: 0 };
}

// Units this leg can still move this tick; 0 when it is finished or blocked by intents already registered.
function plannedAmount(leg: TransferLeg, creep: CreepExtra, target: ResourceContainer): number {
  const remaining = Math.abs(leg.quantity) - leg.moved;
  if (remaining <= 0) return 0;

  const giving = leg.quantity > 0;
  const source: ResourceContainer = giving ? creep : target;
  const dest: ResourceContainer = giving ? target : creep;
  const available = storedOf(source, leg.resourceType) - outflowOf(source.id, leg.resourceType);
  const space = freeOf(dest, leg.resourceType) - inflowOf(dest.id);
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

function formatQuantity(quantity: number): string {
  const magnitude = Math.abs(quantity) >= UNBOUNDED ? '∞' : String(Math.abs(quantity));
  return quantity < 0 ? `-${magnitude}` : magnitude;
}

export class Transfer extends TargetTask<ResourceContainer> {
  static readonly action = '🔁' as const;

  static {
    RegisterTask(this);
  }

  protected static override readonly minRangeToAct = 1;

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

  /** Whether any leg takes resources out of the target, which counts as collection for reservations. */
  public get hasTake(): boolean {
    return this.legs.some(leg => leg.quantity < 0);
  }

  private nextMove(creep: CreepExtra, target: ResourceContainer): { leg: TransferLeg; amount: number } | undefined {
    for (const leg of this.legs) {
      const amount = plannedAmount(leg, creep, target);
      if (amount > 0) return { leg, amount };
    }
    return undefined;
  }

  public actWhenTargetValid(creep: CreepExtra, target: ResourceContainer): TaskActionResult | null {
    const next = this.nextMove(creep, target);
    if (!next) return null;

    // Taking from a creep spends that creep's transfer slot, not ours.
    const actor = next.leg.quantity < 0 && target instanceof Creep ? target : creep;
    if (currentLedger().actors.has(actor.id)) return null;

    const result = performIntent(creep, target, next.leg, next.amount);
    if (result === OK) {
      next.leg.moved += next.amount;
      const giving = next.leg.quantity > 0;
      const sourceId: string = giving ? creep.id : target.id;
      const destId: string = giving ? target.id : creep.id;
      recordIntent(actor.id, sourceId, destId, next.leg.resourceType, next.amount);
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
    const legs = this.legs.map(leg => `${leg.resourceType} ${leg.moved}/${formatQuantity(leg.quantity)}`);
    return `${legs.join(', ')}, %${ResourceContainerUsedRatio(target)} stored`;
  }
}
