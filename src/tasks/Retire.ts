import { CreepExtra } from 'Creep';
import { RegisterTask, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Retire extends TargetTask<StructureSpawn> {
  static readonly action = '🥀' as const;

  static {
    RegisterTask(this);
  }

  protected static override readonly minRangeToAct = 1;

  public constructor(target: StructureSpawn) {
    super(target, 1);
  }

  public extraToString(): string {
    return '';
  }

  protected registerIntent(creep: CreepExtra, target: NonNullable<StructureSpawn>): ScreepsReturnCode {
    return target.recycleCreep(creep);
  }

  protected isIntentBlocked(): boolean {
    return false;
  }

  public isCreepAbleToContinue(): boolean {
    return true;
  }

  public isCompleteWhenTargetValid(): boolean {
    return false;
  }

  protected override handleOutcomeExtra(creep: CreepExtra, result: TaskActionResult | null): TaskActionResult | null {
    if (result?.result === OK) {
      // Gonna die at the end of this tick
      creep.OnLastTickOfLife();
    }
    return result;
  }
}
