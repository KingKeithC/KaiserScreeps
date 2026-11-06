import { CreepExtra } from 'Creep';
import { RegisterTask, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Claim extends TargetTask<StructureController> {
  static readonly action = '🏁' as const;

  static {
    RegisterTask(this);
  }

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

  public actWhenTargetValid(creep: CreepExtra, target: StructureController): TaskActionResult | null {
    if (target.owner?.username !== undefined && target.owner?.username !== creep.owner.username)
      return this.movementResult(creep.attackController(target), target);
    else if (this.claim) return this.movementResult(creep.claimController(target), target);
    else return this.movementResult(creep.reserveController(target), target);
  }
}
