import { CreepExtra } from 'Creep';
import { TaskAction, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class GuardTask extends TargetTask<typeof TaskAction.Guard, StructureRampart> {
  public readonly kind = 'guard' as const;

  public constructor(post: StructureRampart) {
    super(TaskAction.Guard, post);
  }

  public isCompleteWhenTargetValid(): boolean {
    return false; // State of the Rampart we are guarding is irrelevant
  }

  public isCreepAbleToContinue(creep: CreepExtra): boolean {
    // We can continue guarding so long as the room is free of hostiles
    return creep.AssignedRoom.find(FIND_HOSTILE_CREEPS).length === 0;
  }

  public extraToString(target: StructureRampart): string {
    return `%${((target.hits / target.hitsMax) * 100).toFixed(2)}`;
  }

  public actWhenTargetValid(creep: CreepExtra, target: StructureRampart): TaskActionResult | null {
    // Do nothing if we're sitting on the rampart
    if (creep.pos.isEqualTo(target.pos)) return null;

    // Otherwise, move to the rampart
    return { range: 0, result: ERR_NOT_IN_RANGE, target };
  }
}
