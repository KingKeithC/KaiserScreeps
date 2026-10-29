import { CreepExtra } from 'Creep';
import { ResourceContainer } from 'utils/RoomUtils';
import { BaseTask } from './BaseTask';
import { TaskAction } from './TaskAction';
import { TaskActionResult } from './types';

export class Collect extends BaseTask<typeof TaskAction.Collect> {
  public readonly kind = 'collectEnergy' as const;

  private attempts = 0;
  private lastInventory = 0;
  public readonly targetId: Id<ResourceContainer>;

  public constructor(
    targetOrId: Id<ResourceContainer> | ResourceContainer,
    public readonly resourceType: ResourceConstant = RESOURCE_ENERGY,
    public readonly maxAttempts = 5,
    public readonly smallPickupThreshold = 50,
  ) {
    super(TaskAction.Collect);
    if ('id' in targetOrId) this.targetId = targetOrId.id;
    else this.targetId = targetOrId;
  }

  public toString(): string {
    const attempts = this.maxAttempts === undefined ? '' : ` (${this.attempts}/${this.maxAttempts} attempts)`;
    const tgt = Game.getObjectById(this.targetId);
    const resourceType = this.resourceType === RESOURCE_ENERGY ? '' : ` (of ${this.resourceType})`;
    return `${this.action}${resourceType} on ${tgt !== null ? String(tgt) : this.targetId}${attempts}`;
  }

  public override act(creep: CreepExtra): TaskActionResult | null {
    const source = Game.getObjectById(this.targetId);
    // Ruins can have null capacity so return early on them
    if (source === null || ('store' in source && source.store.getUsedCapacity(this.resourceType) === null)) {
      this.attempts++;
      return null;
    }

    const currentInventory = creep.store.getUsedCapacity(this.resourceType);
    const result =
      source instanceof Creep
        ? source.transfer(creep, this.resourceType)
        : source instanceof Resource
          ? creep.pickup(source)
          : creep.withdraw(source, this.resourceType);
    this.lastInventory = currentInventory;

    if (result === OK && currentInventory - this.lastInventory <= this.smallPickupThreshold) this.attempts++;
    else if (result !== OK && result !== ERR_NOT_IN_RANGE) this.attempts++;

    return { target: source, range: 1, result };
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.getFreeCapacity(this.resourceType) === 0) return true;
    if (this.attempts >= this.maxAttempts) return true;
    const source = Game.getObjectById(this.targetId);
    return (
      source === null ||
      ('store' in source && source.store.getUsedCapacity(this.resourceType) === null) ||
      ('store' in source && source.store.getUsedCapacity(this.resourceType) === 0) ||
      ('amount' in source && source.amount === 0)
    );
  }
}
