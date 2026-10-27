import { CreepExtra } from 'Creep';
import { BaseTask } from './BaseTask';
import { TaskAction } from './TaskAction';
import { TaskActionResult } from './types';

type HasEnergy =
  CreepExtra | StructureLink | StructureStorage | StructureContainer | Resource<RESOURCE_ENERGY> | Ruin | Tombstone;

export class CollectEnergy extends BaseTask<typeof TaskAction.CollectEnergy> {
  public readonly kind = 'collectEnergy' as const;

  private attempts = 0;
  private lastInventory = 0;
  public readonly targetId: Id<HasEnergy>;

  public constructor(
    targetOrId: Id<HasEnergy> | HasEnergy,
    public readonly maxAttempts = 5,
    public readonly smallPickupThreshold = 50,
  ) {
    super(TaskAction.CollectEnergy);
    if ('id' in targetOrId) this.targetId = targetOrId.id;
    else this.targetId = targetOrId;
  }

  public toString(): string {
    const attempts = this.maxAttempts === undefined ? '' : ` (${this.maxAttempts} attempts)`;
    return `${this.action} on ${this.targetId}${attempts}`;
  }

  public override act(creep: CreepExtra): TaskActionResult | null {
    const source = Game.getObjectById(this.targetId);
    if (source === null) return null;

    const currentInventory = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const result =
      source instanceof Creep
        ? source.transfer(creep, RESOURCE_ENERGY)
        : source instanceof Resource
          ? creep.pickup(source)
          : creep.withdraw(source, RESOURCE_ENERGY);
    this.lastInventory = currentInventory;

    if (result === OK && currentInventory - this.lastInventory <= this.smallPickupThreshold) this.attempts++;
    else if (result !== OK && result !== ERR_NOT_IN_RANGE) this.attempts++;

    return { target: source, range: 1, result };
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;
    if (this.attempts >= this.maxAttempts) return true;
    const source = Game.getObjectById(this.targetId);
    return (
      source === null ||
      ('store' in source && source.store.getUsedCapacity(RESOURCE_ENERGY) === null) ||
      ('store' in source && source.store.getUsedCapacity(RESOURCE_ENERGY) === 0) ||
      ('amount' in source && source.amount === 0)
    );
  }
}
