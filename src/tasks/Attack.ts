import type { CreepExtra } from 'Creep';
import { CreepTask, RegisterTask } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Attack extends TargetTask<Creep> implements CreepTask {
  static readonly action = '⚔️' as const;

  static {
    RegisterTask(this);
  }

  protected static override readonly minRangeToAct = 1;
  protected static override readonly requiredBodyPart = ATTACK;

  public constructor(creep: Creep) {
    super(creep, 1);
  }

  protected registerIntent(creep: CreepExtra, target: NonNullable<Creep>): ScreepsReturnCode {
    return creep.attack(target);
  }

  protected isIntentBlocked(): boolean {
    return false;
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
