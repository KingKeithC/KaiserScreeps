import { CreepExtra } from 'Creep';
import { TaskAction, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Dismantle extends TargetTask<typeof TaskAction.Dismantle, AnyStructure> {
  public readonly kind = 'dismantle' as const;

  public constructor(target: AnyStructure) {
    super(TaskAction.Dismantle, target);
  }

  actWhenTargetValid(creep: CreepExtra, target: NonNullable<AnyStructure>): TaskActionResult | null {
    return { range: 1, result: creep.dismantle(target), target };
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
