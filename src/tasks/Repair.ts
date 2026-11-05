import { CreepExtra } from 'Creep';
import { RegisterTask, TaskAction, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Repair extends TargetTask<typeof TaskAction.Repair, AnyStructure> {
  static {
    RegisterTask(TaskAction.Repair, this.prototype);
  }

  public constructor(target: AnyStructure) {
    super(target);
  }

  public extraToString(target: AnyStructure): string {
    return `%${((target.hits / target.hitsMax) * 100).toFixed(2)}`;
  }

  public actWhenTargetValid(creep: CreepExtra, target: NonNullable<AnyStructure>): TaskActionResult | null {
    return { range: 1, result: creep.repair(target), target };
  }

  public isCreepAbleToContinue(creep: CreepExtra): boolean {
    return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
  }

  public isCompleteWhenTargetValid(creep: CreepExtra, target: NonNullable<AnyStructure>): boolean {
    return target.hits >= target.hitsMax;
  }
}
