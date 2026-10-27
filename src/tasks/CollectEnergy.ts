import { CreepExtra } from 'Creep';
import { ResourceContainer } from 'utils/RoomUtils';
import { TargetTask } from './TargetTask';
import { TaskAction } from './TaskAction';
import { TaskActionResult } from './types';

export class Collect extends TargetTask<typeof TaskAction.Collect, ResourceContainer> {
  public readonly kind = 'collectEnergy' as const;

  private attempts = 0;
  private lastInventory = 0;

  public constructor(
    target: ResourceContainer,
    public readonly resourceType: ResourceConstant = RESOURCE_ENERGY,
    public readonly maxAttempts = 5,
    public readonly smallPickupThreshold = 50,
  ) {
    super(TaskAction.Collect, target);
  }

  public extraToString(): string {
    const resourceType = this.resourceType === RESOURCE_ENERGY ? '' : ` (of ${this.resourceType})`;
    return this.maxAttempts === undefined ? '' : ` (${resourceType}, ${this.attempts}/${this.maxAttempts} attempts)`;
  }

  public override act(creep: CreepExtra): TaskActionResult | null {
    // Ruins can have null capacity so return early on them
    if (
      this.target === null ||
      ('store' in this.target && this.target.store.getUsedCapacity(this.resourceType) === null)
    ) {
      this.attempts++;
      return null;
    }

    const currentInventory = creep.store.getUsedCapacity(this.resourceType);

    const result =
      this.target instanceof Creep
        ? this.target.transfer(creep, this.resourceType)
        : this.target instanceof Resource
          ? creep.pickup(this.target)
          : creep.withdraw(this.target, this.resourceType);
    this.lastInventory = currentInventory;

    if (result === OK && currentInventory - this.lastInventory <= this.smallPickupThreshold) this.attempts++;
    else if (result !== OK && result !== ERR_NOT_IN_RANGE) this.attempts++;

    return { target: this.target, range: 1, result };
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
