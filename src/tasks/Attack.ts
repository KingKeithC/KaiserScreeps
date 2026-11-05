import type { CreepExtra } from 'Creep';
import { TaskAction, CreepTask, RegisterTask, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Attack extends TargetTask<typeof TaskAction.Attack, Creep> implements CreepTask<typeof TaskAction.Attack> {
  static {
    RegisterTask(TaskAction.Attack, this.prototype);
  }

  public constructor(creep: Creep) {
    super(creep);
  }

  actWhenTargetValid(creep: CreepExtra, target: NonNullable<Creep>): TaskActionResult | null {
    return { range: 1, result: creep.attack(target), target };
  }

  isCreepAbleToContinue(): boolean {
    return true; // For now the creep will attack no matter their condition.
  }

  isCompleteWhenTargetValid(): boolean {
    return false; // If the target is valid, then we continue attacking until it is not :)
  }

  extraToString(target: NonNullable<Creep>): string {
    return `%${((target.hits / target.hitsMax) * 100).toFixed(2)}, name: "${target.name}", Owner: ${target.owner.username}`;
  }
}
