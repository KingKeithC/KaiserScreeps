import { CreepExtra } from 'Creep';
import { RegisterTask, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Supply extends TargetTask<AnyStoreStructure> {
  static readonly action = '🫴' as const;

  static {
    RegisterTask(this);
  }

  public constructor(
    target: AnyStoreStructure,
    public readonly resourceType: ResourceConstant = RESOURCE_ENERGY,
    public freeTargetCapacityToConsiderComplete: number = 0,
  ) {
    super(target);
  }

  extraToString(target: AnyStoreStructure): string {
    return `%${(((target.store.getUsedCapacity(this.resourceType) ?? 0) / (target.store.getCapacity(this.resourceType) ?? 1)) * 100).toFixed(2)}`;
  }

  public actWhenTargetValid(creep: CreepExtra, target: NonNullable<AnyStoreStructure>): TaskActionResult | null {
    return { range: 1, result: creep.transfer(target, this.resourceType), target };
  }

  public isCreepAbleToContinue(creep: CreepExtra): boolean {
    return creep.store.getUsedCapacity(this.resourceType) > 0;
  }

  public isCompleteWhenTargetValid(_creep: CreepExtra, target: NonNullable<AnyStoreStructure>): boolean {
    return (target.store.getFreeCapacity(this.resourceType) ?? 0) <= this.freeTargetCapacityToConsiderComplete;
  }

  public override handleOutcome(creep: CreepExtra, results: TaskActionResult | null): TaskActionResult | null {
    results = super.handleOutcome(creep, results);
    if (results?.result === ERR_FULL) this.isCompleteFlag = true;
    if (results?.result === ERR_NOT_ENOUGH_RESOURCES) this.isCompleteFlag = true;
    if (this.isCompleteFlag) return { ...results, result: OK } as TaskActionResult;
    return results;
  }
}
