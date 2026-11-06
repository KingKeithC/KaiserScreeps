import { CreepExtra } from 'Creep';
import { RegisterTask, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class Dismantle extends TargetTask<AnyStructure> {
  static readonly action = '🔱' as const;

  static {
    RegisterTask(this);
  }

  public constructor(target: AnyStructure) {
    super(target, 1);
  }

  actWhenTargetValid(creep: CreepExtra, target: NonNullable<AnyStructure>): TaskActionResult | null {
    return this.movementResult(creep.dismantle(target), target);
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
