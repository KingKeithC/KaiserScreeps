import type { CreepExtra } from 'Creep';
import { RegisterTask, TaskAction, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Build extends TargetTask<typeof TaskAction.Build, ConstructionSite<BuildableStructureConstant>> {
  static {
    RegisterTask(TaskAction.Build, this.prototype);
  }

  public constructor(target: ConstructionSite<BuildableStructureConstant>) {
    super(target);
  }

  extraToString(target: ConstructionSite<BuildableStructureConstant>): string {
    const progress = (target.progress / target.progressTotal) * 100;
    return `%${progress.toExponential(2)}`;
  }

  actWhenTargetValid(creep: CreepExtra, target: ConstructionSite<BuildableStructureConstant>): TaskActionResult | null {
    return { range: 3, result: creep.build(target), target };
  }

  public isCreepAbleToContinue(creep: CreepExtra): boolean {
    return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
  }

  public isCompleteWhenTargetValid(creep: CreepExtra, target: ConstructionSite<BuildableStructureConstant>): boolean {
    return target.progress >= target.progressTotal;
  }
}
