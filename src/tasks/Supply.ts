import { CreepExtra } from 'Creep';
import { TaskAction, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Supply extends TargetTask<typeof TaskAction.Supply, AnyStoreStructure> {
  public readonly kind = 'supply' as const;

  public constructor(
    target: AnyStoreStructure,
    public readonly resourceType: ResourceConstant = RESOURCE_ENERGY,
    public freeCapacityToConsiderComplete: number = 0,
  ) {
    super(TaskAction.Supply, target);
  }

  extraToString(target: AnyStoreStructure): string {
    const capacity = (target.store.getUsedCapacity(RESOURCE_ENERGY) / target.store.getCapacity(RESOURCE_ENERGY)) * 100;
    return `%${capacity.toFixed(2)}`;
  }

  public actWhenTargetValid(creep: CreepExtra, target: NonNullable<AnyStoreStructure>): TaskActionResult | null {
    return { range: 1, result: creep.transfer(target, RESOURCE_ENERGY), target };
  }

  public isCreepAbleToContinue(creep: CreepExtra): boolean {
    return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
  }

  public isCompleteWhenTargetValid(_creep: CreepExtra, target: NonNullable<AnyStoreStructure>): boolean {
    return target.store.getFreeCapacity(RESOURCE_ENERGY) < this.freeCapacityToConsiderComplete;
  }

  public override handleOutcome(creep: CreepExtra, result: TaskActionResult | null): void {
    super.handleOutcome(creep, result);
    if (result?.result === ERR_FULL) this.isCompleteFlag = true;
    if (result?.result === ERR_NOT_ENOUGH_RESOURCES) this.isCompleteFlag = true;
  }
}
