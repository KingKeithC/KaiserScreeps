import { CreepExtra } from 'Creep';
import { RegisterTask } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class GuardTask extends TargetTask<StructureRampart> {
  static readonly action = '🛡️' as const;

  static {
    RegisterTask(this);
  }

  // Only standing on the post counts as in range.
  protected static override readonly minRangeToAct = 0;

  public constructor(post: StructureRampart) {
    super(post, 0, post.pos);
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

  protected isIntentBlocked(creep: CreepExtra, post: StructureRampart): boolean {
    return creep.pos.isEqualTo(post.pos); // Already on the post, so there is nothing to do.
  }

  // Unreachable: off the post is out of range, and on it is blocked.
  protected registerIntent(): ScreepsReturnCode {
    return ERR_NOT_IN_RANGE;
  }
}
