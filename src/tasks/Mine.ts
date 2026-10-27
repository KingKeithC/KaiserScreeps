import { CreepExtra } from 'Creep';
import { DeserializeRoomPosition } from 'utils/Collections';
import { MiningPosition } from 'utils/RoomUtils';
import { TargetTask } from './TargetTask';
import { TaskAction } from './TaskAction';
import { TaskActionResult } from './types';

export class Mine extends TargetTask<typeof TaskAction.Mine, MiningPosition> {
  public readonly kind = 'mine' as const;

  public constructor(mp: MiningPosition) {
    super(TaskAction.Mine, mp, 'mining position');
  }

  public override act(creep: CreepExtra): TaskActionResult | null {
    const sourcePos = { pos: DeserializeRoomPosition(this.target.pos) };

    const source = Game.getObjectById(this.target.source);
    if (!source) return { range: 0, result: ERR_NOT_IN_RANGE, target: sourcePos };

    const outcome: TaskActionResult = { range: 0, result: creep.harvest(source), target: sourcePos };
    if (outcome?.result === ERR_NOT_OWNER) outcome.result = ERR_NOT_IN_RANGE; // Ignore owner errors, forward to a 'move' instruction
    return outcome;
  }

  public override isComplete(creep: CreepExtra): boolean {
    // If the target is no longer claimed, we're done
    if (!(this.target.pos in creep.AssignedRoom.ClaimedMinePositions)) return true;

    // Otherwise, a miner's work is never done
    const isAMiner = creep.role?.groupName === 'Miners';
    if (isAMiner) return false;

    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;

    const source = Game.getObjectById(this.target.source);
    return !(source instanceof Source) || source.energy === 0;
  }
}
