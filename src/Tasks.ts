/* eslint-disable max-classes-per-file */
import type { CreepExtra } from "Creep";

export interface TaskActionResult {
  target: RoomObject;
  result: number;
  range: number;
}

export interface CreepTask<Action extends string = string> {
  readonly kind: string;
  readonly action: Action;
  toString(): string;
  isComplete(creep: CreepExtra): boolean;
  act(creep: CreepExtra): TaskActionResult | null;
}

export type TravelPath = { exit: ExitConstant; room: string; }[];
export type EnergySource =
  | { kind: "creep"; name: string; }
  | { kind: "container"; id: Id<StructureContainer>; };

export const TaskAction = {
  Idle: '💤',
  Mine: '⛏️',
  CollectEnergy: '🔌',
  MaintainController: '🦸‍♀️',
  Build: '🏗️',
  Repair: '🛠️',
  Supply: '🫴',
  UpgradeController: '🔼',
  Pickup: "🧹",
  Attack: "⚔️",
  Guard: "🛡️",
  Scout: "👀",
  Claim: "🏁",
} as const;

export abstract class BaseTask<Action extends string> implements CreepTask<Action> {
  public abstract readonly kind: string;
  public constructor(public readonly action: Action) { }

  public toString(): string { return this.action; }

  public isComplete(_creep: CreepExtra): boolean { return false; }

  public act(_creep: CreepExtra): TaskActionResult | null { return null; }

  protected perform<Target extends RoomObject>(
    target: Target | null,
    range: number,
    action: (target: Target) => number,
  ): TaskActionResult | null {
    return target ? { target, range, result: action(target) } : null;
  }
}

export abstract class TargetTask<Action extends string, Target> extends BaseTask<Action> {
  public constructor(
    action: Action,
    public readonly target: Target,
    private readonly targetType = "target",
  ) {
    super(action);
  }

  public toString(): string {
    const target = Game.getObjectById(this.target as Id<Source>);
    return `${this.action} on ${target ? String(target) : `[${this.targetType} ${String(this.target)}]`}`;
  }

  protected resolveTarget(): RoomObject | null {
    return Game.getObjectById(this.target as Id<Source>) as RoomObject | null;
  }
}


export class Idle extends BaseTask<typeof TaskAction.Idle> {
  public readonly kind = "idle" as const;

  public constructor() { super(TaskAction.Idle); }

  public override isComplete(_creep: CreepExtra): boolean { return true; }
}

export class Mine extends TargetTask<typeof TaskAction.Mine, Id<Source>> {
  public readonly kind = "mine" as const;

  public constructor(target: Id<Source>) { super(TaskAction.Mine, target, "source"); }

  public override act(creep: CreepExtra) {
    const target = Game.getObjectById(this.target);
    return this.perform(target instanceof Source ? target : null, 1, source => creep.harvest(source));
  }

  public override isComplete(creep: CreepExtra): boolean {
    const isAMiner = creep.role?.groupName === "Miners";

    // Done if we have no space left for energy (unless we are a miner)
    if (!isAMiner && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0)
      return true;

    // Done if we are not a miner, and there is a miner nearby
    if (!isAMiner && creep.pos.findInRange(FIND_MY_CREEPS, 4, { filter: c => c.memory.role.startsWith("Miner") }).length > 0)
      return true;

    // Done if the target isn't a source or is out of energy
    const source = this.resolveTarget();
    return !(source instanceof Source) || source.energy === 0;
  }
}


export interface CollectEnergyOptions {
  maxAttempts?: number;
}

export class CollectEnergy extends BaseTask<typeof TaskAction.CollectEnergy> {
  public readonly kind = "collectEnergy" as const;
  public readonly source: EnergySource;
  public attempts = 0;
  public readonly maxAttempts?: number;

  public constructor(source: string | EnergySource, options: CollectEnergyOptions = {}) {
    super(TaskAction.CollectEnergy);
    this.source = typeof source === "string"
      ? { kind: "creep", name: source }
      : source;
    this.maxAttempts = options.maxAttempts;
  }

  public toString(): string {
    const target = this.source.kind === "creep"
      ? `[creep ${this.source.name}]`
      : Game.getObjectById(this.source.id)?.toString() ?? `[container ${this.source.id}]`;
    const attempts = this.maxAttempts === undefined ? "" : ` (${this.maxAttempts} attempts)`;
    return `${this.action} on ${target}${attempts}`;
  }

  public override act(creep: CreepExtra) {
    const source = this.source.kind === "creep"
      ? Game.creeps[this.source.name] ?? null
      : Game.getObjectById(this.source.id);
    if (!(source instanceof Creep) && !(source instanceof StructureContainer)) return null;

    const result = source instanceof Creep
      ? source.transfer(creep, RESOURCE_ENERGY)
      : creep.withdraw(source, RESOURCE_ENERGY);
    if (result !== OK && result !== ERR_NOT_IN_RANGE) this.attempts++;
    return { target: source, range: 1, result };
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;
    if (this.maxAttempts !== undefined && (this.attempts ?? 0) >= this.maxAttempts) return true;
    const source = this.source.kind === "creep"
      ? Game.creeps[this.source.name] ?? null
      : Game.getObjectById(this.source.id);
    return !(source instanceof Creep) && !(source instanceof StructureContainer)
      || source.store.getUsedCapacity(RESOURCE_ENERGY) === 0;
  }
}

export interface UpdateControllerOptions {
  mode?: "upgrade" | "maintain";
}

export class UpdateController extends BaseTask<typeof TaskAction.MaintainController | typeof TaskAction.UpgradeController> {
  static readonly MaintenanceThreshold = 3500;
  static readonly MaintenanceBuffer = 2000;

  public readonly kind = "updateController" as const;
  public readonly mode: "upgrade" | "maintain";

  public constructor(public readonly controllerId?: Id<StructureController>, options: UpdateControllerOptions = {}) {
    const mode = options.mode ?? "upgrade";
    super(mode === "maintain" ? TaskAction.MaintainController : TaskAction.UpgradeController);
    this.mode = mode;
  }

  public toString(): string {
    const controller = this.controllerId ? Game.getObjectById(this.controllerId) : null;
    const target = controller ? String(controller) : this.controllerId ? `[controller ${this.controllerId}]` : "[room controller]";
    return `${this.action} on ${target}`;
  }

  public override act(creep: CreepExtra) {
    const target = this.controllerId
      ? Game.getObjectById(this.controllerId)
      : creep.room.controller;
    return this.perform(target instanceof StructureController ? target : null, 3, controller => creep.upgradeController(controller));
  }

  public override isComplete(creep: CreepExtra): boolean {
    const target = this.controllerId ? Game.getObjectById(this.controllerId) : creep.room.controller;
    if (!(target instanceof StructureController)) return true;
    if (creep.store.energy === 0) return true;
    return this.mode === "maintain"
      && target.ticksToDowngrade > UpdateController.MaintenanceThreshold + UpdateController.MaintenanceBuffer;
  }
}

export class MaintainController extends UpdateController {
  public constructor(controllerId?: Id<StructureController>) {
    super(controllerId, { mode: "maintain" });
  }
}

export class Build extends TargetTask<typeof TaskAction.Build, Id<ConstructionSite<BuildableStructureConstant>>> {
  public readonly kind = "build" as const;

  public constructor(target: Id<ConstructionSite<BuildableStructureConstant>>) { super(TaskAction.Build, target, "construction site"); }

  public override act(creep: CreepExtra) {
    const target = Game.getObjectById(this.target);
    return this.perform(target instanceof ConstructionSite ? target : null, 3, site => creep.build(site));
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.energy === 0) return true;
    const target = this.resolveTarget();
    return !(target instanceof ConstructionSite) || target.progress === target.progressTotal;
  }
}

export class Repair extends TargetTask<typeof TaskAction.Repair, Id<AnyStructure>> {
  public readonly kind = "repair" as const;

  public constructor(target: Id<AnyStructure>) { super(TaskAction.Repair, target, "structure"); }

  public override act(creep: CreepExtra) {
    const target = Game.getObjectById(this.target);
    return this.perform(target instanceof Structure ? target : null, 3, structure => creep.repair(structure as AnyOwnedStructure));
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.energy === 0) return true;
    const target = this.resolveTarget();
    return !(target instanceof Structure) || target.hits === target.hitsMax;
  }
}

export class Supply extends TargetTask<typeof TaskAction.Supply, Id<AnyStoreStructure>> {
  public readonly kind = "supply" as const;

  public constructor(target: Id<AnyStoreStructure>) { super(TaskAction.Supply, target, "structure"); }

  public override act(creep: CreepExtra) {
    const target = Game.getObjectById(this.target);
    return this.perform(target && "store" in target ? target as AnyStoreStructure : null, 1, structure => creep.transfer(structure, RESOURCE_ENERGY));
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.energy === 0) return true;
    const target = this.resolveTarget();
    return !target || !("store" in target)
      || (target as AnyStoreStructure).store.getFreeCapacity(RESOURCE_ENERGY) === 0;
  }
}

export class Pickup extends TargetTask<typeof TaskAction.Pickup, Id<Resource<RESOURCE_ENERGY>>> {
  public readonly kind = "pickup" as const;

  public constructor(target: Id<Resource<RESOURCE_ENERGY>>) { super(TaskAction.Pickup, target, "resource"); }

  public override act(creep: CreepExtra) {
    const target = Game.getObjectById(this.target);
    return this.perform(target instanceof Resource ? target : null, 0, resource => creep.pickup(resource));
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;
    const target = this.resolveTarget();
    return !(target instanceof Resource) || target.amount === 0;
  }
}

export class AttackTargetTask extends BaseTask<typeof TaskAction.Attack> {
  public readonly kind = "attack" as const;

  public constructor(public readonly targetId: Id<Creep>) { super("⚔️"); }

  public toString(): string { return `${this.action} ${this.targetId}`; }

  public override isComplete(creep: CreepExtra): boolean {
    const target = Game.getObjectById(this.targetId);
    return !(target instanceof Creep) || !creep.room.find(FIND_HOSTILE_CREEPS).some(hostile => hostile.id === target.id);
  }
}

export class GuardTask extends BaseTask<typeof TaskAction.Guard> {
  public readonly kind = "guard" as const;

  public constructor() { super(TaskAction.Guard); }

  public override isComplete(creep: CreepExtra): boolean {
    return creep.room.find(FIND_HOSTILE_CREEPS).length > 0;
  }
}

export class ScoutMissionTask extends BaseTask<typeof TaskAction.Scout> {
  public readonly kind = "scout" as const;

  public constructor(
    public readonly flag: string,
    public path: TravelPath = [],
  ) { super(TaskAction.Scout); }

  public toString(): string { return `${this.action} to ${this.flag}`; }

  public override isComplete(_creep: CreepExtra): boolean {
    return !this.flag || !Game.flags[this.flag];
  }
}

export class ClaimRoomTask extends BaseTask<typeof TaskAction.Claim> {
  public readonly kind = "claim" as const;

  public constructor(
    public readonly roomName: string,
    public path: TravelPath = [],
    public readonly reserve = false,
  ) { super(TaskAction.Claim); }

  public toString(): string { return `${this.action} ${this.roomName}`; }

  public override isComplete(_creep: CreepExtra): boolean {
    if (!this.roomName) return true;
    return Game.rooms[this.roomName]?.controller?.my === true;
  }
}
