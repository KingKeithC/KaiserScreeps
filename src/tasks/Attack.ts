import type { CreepExtra } from 'Creep';
import { TaskAction } from './TaskAction';
import { CreepTask, TaskActionResult } from './types';
import { TargetTask } from './TargetTask';

export class Attack extends TargetTask<typeof TaskAction.Attack, Creep> implements CreepTask<string> {
  public readonly kind = 'attack' as const;

  public constructor(creep: Creep) {
    super(TaskAction.Attack, creep);
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
