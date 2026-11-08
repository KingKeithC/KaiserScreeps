import { CreepExtra } from 'Creep';
import { RegisterTask } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Claim extends TargetTask<StructureController> {
  static readonly action = '🏁' as const;

  static {
    RegisterTask(this);
  }

  protected static override readonly minRangeToAct = 1;
  protected static override readonly requiredBodyPart = CLAIM;

  public constructor(
    controller: StructureController,
    public readonly claim = false, // false = 'reserve'
  ) {
    super(controller, 1);
  }

  isCreepAbleToContinue(): boolean {
    return true; // If a claimer is a alive, then it's good to go
  }

  extraToString(target: StructureController): string {
    return `%${((target.progress / target.progressTotal) * 100).toFixed(2)}`;
  }

  public isCompleteWhenTargetValid(creep: CreepExtra, target: StructureController): boolean {
    return target.owner?.username === creep.owner.username;
  }

  protected registerIntent(creep: CreepExtra, target: StructureController): number {
    if (target.owner?.username !== undefined && target.owner?.username !== creep.owner.username)
      return creep.attackController(target);
    if (this.claim) return creep.claimController(target);
    return creep.reserveController(target);
  }

  protected isIntentBlocked(): boolean {
    return false;
  }
}
