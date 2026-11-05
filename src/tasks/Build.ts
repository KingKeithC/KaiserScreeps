import type { CreepExtra } from 'Creep';
import { RegisterTask, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Build extends TargetTask<ConstructionSite<BuildableStructureConstant>> {
  static readonly action = '🏗️' as const;

  static {
    RegisterTask(this);
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
