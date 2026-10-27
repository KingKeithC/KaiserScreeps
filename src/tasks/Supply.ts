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

  extraToString(): string {
    if (this.target === null) return 'null';
    const capacity =
      this.target?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0 / this.target?.store.getCapacity(RESOURCE_ENERGY) ?? 1;
    return '%' + capacity.toFixed(2);
  }

  public override act(creep: CreepExtra): TaskActionResult | null {
    if (this.target === null) return null;
    return { range: 1, result: creep.transfer(this.target, RESOURCE_ENERGY), target: this.target };
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) return true;
    return (
      this.target === null || this.target.store.getFreeCapacity(RESOURCE_ENERGY) < this.freeCapacityToConsiderComplete
    );
  }
}
