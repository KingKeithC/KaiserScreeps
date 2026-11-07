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
    super(target, 1);
  }

  extraToString(target: AnyStoreStructure): string {
    return `%${(((target.store.getUsedCapacity(this.resourceType) ?? 0) / (target.store.getCapacity(this.resourceType) ?? 1)) * 100).toFixed(2)}`;
  }

  public actWhenTargetValid(creep: CreepExtra, target: NonNullable<AnyStoreStructure>): TaskActionResult | null {
    return this.movementResult(creep.transfer(target, this.resourceType), target);
  }

  public isCreepAbleToContinue(creep: CreepExtra): boolean {
    return creep.store.getUsedCapacity(this.resourceType) > 0;
  }

  public isCompleteWhenTargetValid(_creep: CreepExtra, target: NonNullable<AnyStoreStructure>): boolean {
    return (target.store.getFreeCapacity(this.resourceType) ?? 0) <= this.freeTargetCapacityToConsiderComplete;
  }

  protected override handleOutcomeExtra(creep: CreepExtra, results: TaskActionResult | null): TaskActionResult | null {
    if (results?.result === ERR_FULL) this.isCompleteFlag = true;
    if (results?.result === ERR_NOT_ENOUGH_RESOURCES) this.isCompleteFlag = true;
    if (this.isCompleteFlag) return { ...results, result: OK } as TaskActionResult;
    return results;
  }
}
