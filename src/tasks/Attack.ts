import type { CreepExtra } from 'Creep';
import { CreepTask, RegisterTask, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Attack extends TargetTask<Creep> implements CreepTask {
  static readonly action = '⚔️' as const;

  static {
    RegisterTask(this);
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
