import { CreepExtra } from 'Creep';
import { DeserializeRoomPosition } from 'utils/Collections';
import { MiningPosition } from 'utils/RoomUtils';
import { BaseTask } from './BaseTask';
import { TaskAction } from './TaskAction';
import { TaskActionResult } from './types';

export class Mine extends BaseTask<typeof TaskAction.Mine> {
  public readonly kind = 'mine' as const;

  public constructor(public readonly miningPosition: MiningPosition) {
    super(TaskAction.Mine);
  }

  public toString(): string {
    const source = Game.getObjectById(this.miningPosition.source);
    const extra = source !== null ? ` ${((source.energy / source.energyCapacity) * 100).toFixed(2)}` : '';
    const sourceId = source !== null ? String(source) : `[source ${this.miningPosition.source}]`;
    return `${this.action} on ${sourceId} @ ${this.miningPosition.pos}${extra}`;
  }

  public override act(creep: CreepExtra): TaskActionResult | null {
    const sourcePos = { pos: DeserializeRoomPosition(this.miningPosition.pos) };

    const source = Game.getObjectById(this.miningPosition.source);
    if (!source) return { range: 0, result: ERR_NOT_IN_RANGE, target: sourcePos };

    const outcome: TaskActionResult = { range: 0, result: creep.harvest(source), target: sourcePos };
    if (outcome?.result === ERR_NOT_OWNER) outcome.result = ERR_NOT_IN_RANGE; // Ignore owner errors, forward to a 'move' instruction
    return outcome;
  }

  public override isComplete(creep: CreepExtra): boolean {
    // If the target is no longer claimed, we're done
    if (!creep.AssignedRoom.ClaimedMinePositions.some(p => p === this.miningPosition.pos)) return true;

    // If the source is invalid (in a visible room and still null) we're done
    const target = DeserializeRoomPosition(this.miningPosition.pos);
    const source = Game.getObjectById(this.miningPosition.source);
    if (target.roomName in Game.rooms && source === null) return true;

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
