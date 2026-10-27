import { CreepExtra } from 'Creep';
import { TargetTask } from './TargetTask';
import { TaskAction } from './TaskAction';
import { TaskActionResult } from './types';

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

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return true;
    return (
      this.target === null || this.target.store.getFreeCapacity(RESOURCE_ENERGY) < this.freeCapacityToConsiderComplete
    );
  }
}
