import { CreepExtra } from 'Creep';
import { RegisterTask, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Retire extends TargetTask<StructureSpawn> {
  static readonly action = '🥀' as const;

  static {
    RegisterTask(this);
  }

  public constructor(target: StructureSpawn) {
    super(target);
  }

  public extraToString(): string {
    return '';
  }

  public actWhenTargetValid(creep: CreepExtra, target: NonNullable<StructureSpawn>): TaskActionResult | null {
    return { range: 1, result: target.recycleCreep(creep), target };
  }

  public isCreepAbleToContinue(): boolean {
    return true;
  }

  public isCompleteWhenTargetValid(): boolean {
    return false;
  }

  public handleOutcome(creep: CreepExtra, result: TaskActionResult | null): TaskActionResult | null {
    result = super.handleOutcome(creep, result);
    if (result?.result === OK) {
      // Gonna die at the end of this tick
      creep.OnLastTickOfLife();
    }
    return result;
  }
}
