import { CreepExtra } from "Creep";
import { BaseTask } from "./BaseTask";
import { TaskAction } from "./TaskAction";
import { EnergySource } from "./types";

export interface CollectEnergyOptions {
  maxAttempts?: number;
  lastInventory?: number;
}

export class CollectEnergy extends BaseTask<typeof TaskAction.CollectEnergy> {
  public readonly kind = "collectEnergy" as const;
  public readonly source: EnergySource;
  public attempts = 0;
  public lastInventory?: number;
  public readonly maxAttempts?: number;

  SmallPickupThreshold = 50;

  public constructor(source: string | EnergySource, options: CollectEnergyOptions = {}) {
    super(TaskAction.CollectEnergy);
    this.source = typeof source === "string"
      ? { kind: "creep", name: source }
      : source;
    this.maxAttempts = options.maxAttempts;
    this.lastInventory = options.lastInventory;
  }

  public toString(): string {
    const target = this.source.kind === "creep"
      ? `[creep ${this.source.name}]`
      : Game.getObjectById(this.source.id)?.toString() ?? `[??? ${this.source.id}]`;
    const attempts = this.maxAttempts === undefined ? "" : ` (${this.maxAttempts} attempts)`;
    return `${this.action} on ${target}${attempts}`;
  }

  public override act(creep: CreepExtra) {
    const source = this.source.kind === "creep"
      ? Game.creeps[this.source.name] ?? null
      : Game.getObjectById(this.source.id);
    if (
      !(source instanceof Creep)
      && !(source instanceof StructureContainer)
      && !(source instanceof StructureStorage)
      && !(source instanceof StructureLink)
      && !(source instanceof Resource)
      && !(source instanceof Ruin)
    ) return null;

    const lastInventory = this.lastInventory ?? 0;
    const currentInventory = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const result = source instanceof Creep
      ? source.transfer(creep, RESOURCE_ENERGY)
      : source instanceof Resource
      ? creep.pickup(source)
      : creep.withdraw(source, RESOURCE_ENERGY);
    this.lastInventory = currentInventory;

    if (result === OK && currentInventory - lastInventory <= this.SmallPickupThreshold)
      this.attempts++;
    else if (result !== OK && result !== ERR_NOT_IN_RANGE)
      this.attempts++;

    return { target: source, range: 1, result };
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;
    if (this.maxAttempts !== undefined && (this.attempts ?? 0) >= this.maxAttempts) return true;
    const source = this.source.kind === "creep"
      ? Game.creeps[this.source.name] ?? null
      : Game.getObjectById(this.source.id);
    const sourceIsWrongType = source === null ||
      (!(source instanceof Creep)
      && !(source instanceof StructureContainer)
      && !(source instanceof StructureStorage)
      && !(source instanceof StructureLink)
      && !(source instanceof Resource)
      && !(source instanceof Ruin));

    return (
      sourceIsWrongType
      || ("store" in source && source.store.getUsedCapacity(RESOURCE_ENERGY) === 0)
      || ("amount" in source && source.amount === 0)
    );
  }
}
