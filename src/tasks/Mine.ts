import { CreepExtra } from 'Creep';
import { CreepTask, TaskAction, TaskActionResult } from 'tasks/types';
import { DeserializeRoomPosition } from 'utils/Collections';
import { MiningPosition } from 'utils/RoomUtils';

export class Mine implements CreepTask {
  public readonly action = TaskAction.Mine;
  public readonly kind = 'mine' as const;
  public isCompleteFlag = false;

  public constructor(public readonly miningPosition: MiningPosition) {}

  public toString(): string {
    const source = Game.getObjectById(this.miningPosition.source);
    const extra = source !== null ? ` ${((source.energy / source.energyCapacity) * 100).toFixed(2)}` : '';
    const sourceId = source !== null ? String(source) : `[source ${this.miningPosition.source}]`;
    return `${this.action} on ${sourceId} @ ${this.miningPosition.pos}${extra}`;
  }

  public act(creep: CreepExtra): TaskActionResult | null {
    const sourcePos = { pos: DeserializeRoomPosition(this.miningPosition.pos) };

    const source = Game.getObjectById(this.miningPosition.source);
    if (!source) return { range: 0, result: ERR_NOT_IN_RANGE, target: sourcePos };

    const outcome: TaskActionResult = { range: 0, result: creep.harvest(source), target: sourcePos };
    if (outcome?.result === ERR_NOT_OWNER) outcome.result = ERR_NOT_IN_RANGE; // Ignore owner errors, forward to a 'move' instruction
    return outcome;
  }

  public handleOutcome(creep: CreepExtra, outcome: TaskActionResult | null): TaskActionResult | null {
    // If the source is out of energy, and we're not a miner, then we're done
    if (outcome?.result === ERR_NOT_ENOUGH_RESOURCES && creep.role?.groupName === 'Miners') {
      // Since we're a miner, we can ignore the error result
      outcome.result = OK;
    } else if (outcome?.result === ERR_NOT_ENOUGH_RESOURCES) {
      // Non miner, if the source if out of energy, we're done.
      this.isCompleteFlag = true;
      return { ...outcome, result: OK } as TaskActionResult;
    }

    // If the target is no longer claimed, we're done
    if (!creep.AssignedRoom.ClaimedMinePositions.some(p => p === this.miningPosition.pos)) {
      this.isCompleteFlag = true;
      return { ...outcome, result: OK } as TaskActionResult;
    }

    // If the source is invalid (in a visible room and still null) we're done
    const target = DeserializeRoomPosition(this.miningPosition.pos);
    const source = Game.getObjectById(this.miningPosition.source);
    if (target.roomName in Game.rooms && source === null) {
      this.isCompleteFlag = true;
      return outcome;
    } else if (!(target.roomName in Game.rooms)) return outcome; // Can't see the room, so can't discern anymore

    // If someone (other than us) is in our spot, we're done
    const occupier = target.lookFor(LOOK_CREEPS).pop();
    if (occupier !== undefined && occupier.id !== creep.id) {
      this.isCompleteFlag = true;
      return outcome;
    }

    // Otherwise, if we're a miner, mine forever
    if (creep.role?.groupName === 'Miners') {
      this.isCompleteFlag = false;
      return outcome;
    }

    // For all others, we're done when we run out of free space,
    // or the mine runs out of energy
    if (source !== null && source.energy === 0) {
      this.isCompleteFlag = true;
      return outcome;
    }

    this.isCompleteFlag = creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
    return outcome;
  }
}
