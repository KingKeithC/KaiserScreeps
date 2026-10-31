import { CreepExtra } from 'Creep';
import { TaskAction, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Claim extends TargetTask<typeof TaskAction.Claim, StructureController> {
  public readonly kind = 'claim' as const;

  public constructor(
    controller: StructureController,
    public readonly claim = false, // false = 'reserve'
  ) {
    super(TaskAction.Claim, controller);
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
      return { range: 1, result: creep.attackController(target), target };
    else if (this.claim) return { range: 1, result: creep.claimController(target), target };
    else return { range: 1, result: creep.reserveController(target), target };
  }
}
