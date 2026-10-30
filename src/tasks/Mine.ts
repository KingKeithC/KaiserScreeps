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
    if (!creep.AssignedRoom.ClaimedMinePositions.some(p => p === this.target.pos)) return true;

    const target = DeserializeRoomPosition(this.target.pos);
    const source = Game.getObjectById(this.target.source);
    if (target.roomName in Game.rooms && source === null)
      return true; // If the source is invalid (in a visible room and still null) we're done
    else if (!(target.roomName in Game.rooms)) return false; // If it's in a non-visible room, we'll consider it incomplete.

    // If someone (other than us) is in our spot, we're done
    const occupier = target.lookFor(LOOK_CREEPS).pop();
    if (occupier !== undefined && occupier.id !== creep.id) return true;

    // Otherwise, if we're a miner, mine forever
    if (creep.role?.groupName === 'Miners') return false;

    // For all others, we're done when we run out of free space,
    // or the mine runs out of energy
    if (source !== null && source.energy === 0) return true;
    return creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
  }
}
