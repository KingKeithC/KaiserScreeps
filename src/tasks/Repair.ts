import { CreepExtra } from 'Creep';
import { TargetTask } from './TargetTask';
import { TaskAction } from './TaskAction';
import { TaskActionResult } from './types';

export class Repair extends TargetTask<typeof TaskAction.Repair, AnyStructure> {
  public readonly kind = 'repair' as const;

  public constructor(target: AnyStructure) {
    super(TaskAction.Repair, target);
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
