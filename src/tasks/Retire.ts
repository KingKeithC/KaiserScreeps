import { CreepExtra } from 'Creep';
import { RegisterTask, TaskAction, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Retire extends TargetTask<typeof TaskAction.Retire, StructureSpawn> {
  static {
    RegisterTask(TaskAction.Retire, this.prototype);
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
}
