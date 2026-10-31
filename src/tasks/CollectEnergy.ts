import { CreepExtra } from 'Creep';
import { TaskAction, TaskActionResult } from 'tasks/types';
import { ResourceContainer } from 'utils/RoomUtils';
import { TargetTask } from './TargetTask';

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

  public extraToString(target: ResourceContainer): string {
    const remaining =
      'store' in target
        ? '%' +
          (
            (target.store.getUsedCapacity(this.resourceType) ??
              0 / (target.store.getCapacity(this.resourceType) ?? 1)) * 100
          ).toFixed(2)
        : `${target.amount} / Unlimited`;
    return `${this.attempts}/${this.maxAttempts} attempts, ${remaining} stored`;
  }

  public actWhenTargetInvalid(): TaskActionResult | null {
    this.attempts++;
    return null;
  }

  actWhenTargetValid(creep: CreepExtra, target: ResourceContainer): TaskActionResult | null {
    const inventoryChange = creep.store.getUsedCapacity(this.resourceType) - this.lastInventory;
    const result =
      target instanceof Creep
        ? target.transfer(creep, this.resourceType)
        : target instanceof Resource
          ? creep.pickup(target)
          : creep.withdraw(target, this.resourceType);

    if (result === OK && inventoryChange <= this.smallPickupThreshold) this.attempts++;
    else if (result !== OK && result !== ERR_NOT_IN_RANGE) this.attempts++;
    this.lastInventory = inventoryChange;
    return { target, range: 1, result };
  }

  public isCreepAbleToContinue(creep: CreepExtra): boolean {
    if (this.attempts > this.maxAttempts) return false;
    return creep.store.getFreeCapacity(this.resourceType) > 0;
  }

  public isCompleteWhenTargetValid(creep: CreepExtra, target: NonNullable<ResourceContainer>): boolean {
    return (
      ('store' in target && target.store.getUsedCapacity(this.resourceType) === null) ||
      ('store' in target && target.store.getUsedCapacity(this.resourceType) === 0) ||
      ('amount' in target && target.amount === 0)
    );
  }
}
