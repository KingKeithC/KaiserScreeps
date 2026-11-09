import { CreepExtra } from 'Creep';
import { RegisterTask } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Dismantle extends TargetTask<AnyStructure> {
  static readonly action = '🔱' as const;

  static {
    RegisterTask(this);
  }

  protected static override readonly minRangeToAct = 1;
  protected static override readonly requiredBodyPart = WORK;

  public constructor(target: AnyStructure) {
    super(target, 1);
  }

  protected registerIntent(creep: CreepExtra, target: NonNullable<AnyStructure>): ScreepsReturnCode {
    return creep.dismantle(target);
  }

  protected isIntentBlocked(): boolean {
    return false;
  }

  isCreepAbleToContinue(): boolean {
    return true; // If the creep is alive, then it should still be good to go
  }

  isCompleteWhenTargetValid(creep: CreepExtra, target: NonNullable<AnyStructure>): boolean {
    return target.hits === 0;
  }

  extraToString?(target: NonNullable<AnyStructure>): string {
    return `%${((target.hits / target.hitsMax) * 100).toFixed(2)}`;
  }
}
