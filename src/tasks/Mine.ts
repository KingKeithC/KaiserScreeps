import { CreepExtra } from 'Creep';
import { CreepTask, RegisterTask, TaskActionResult, TaskBase } from 'tasks/types';
import { DeserializeRoomPosition, SerializeRoomPosition } from 'utils/Collections';
import { Logger } from 'utils/Logger';
import { MiningPosition } from 'utils/RoomUtils';

export class Mine extends TaskBase<typeof Mine.action> implements CreepTask<typeof Mine.action> {
  static readonly action = '⛏️' as const;
  public isCompleteFlag = false;

  static {
    RegisterTask(this);
  }

  public constructor(public readonly miningPosition: MiningPosition) {
    super();
  }

  protected toStringDetails(): string {
    const source = Game.getObjectById(this.miningPosition.source);

    let extra: string | undefined;
    if (source === null || source === undefined) extra = '';
    else if (source instanceof Source) {
      extra = ` ${((source.energy / source.energyCapacity) * 100).toFixed(2)}`;
    } else if (source instanceof StructureExtractor) {
      const mineral = source.pos.lookFor(LOOK_MINERALS)[0];
      if (!mineral) extra = '';
      else {
        const max = MINERAL_DENSITY[mineral.density];
        const amt = ((mineral.mineralAmount / max) * 100).toFixed(2);
        extra = ` Amount: %${amt} Density: ${mineral.density} Cooldown: ${source.cooldown}`;
      }
    }

    const sourceId = source !== null ? String(source) : `[source ${this.miningPosition.source}]`;
    return `on ${sourceId} @ ${this.miningPosition.pos}${extra}`;
  }

  public act(creep: CreepExtra): TaskActionResult | null {
    const sourcePos = { pos: DeserializeRoomPosition(this.miningPosition.pos) };

    const source = Game.getObjectById(this.miningPosition.source);
    if (!source) return { range: 0, result: ERR_NOT_IN_RANGE, target: sourcePos };

    const mineral: Mineral | undefined = source.pos.lookFor(LOOK_MINERALS)[0];
    if (!mineral && source instanceof StructureExtractor) {
      this.isCompleteFlag = true;
      Logger.crit('Assigned extractor has no mineral beneath it.', {
        '<creep>': creep,
        extractor: source,
        pos: source.pos,
      });
      return null;
    }

    const outcome: TaskActionResult =
      source instanceof StructureExtractor
        ? { range: 0, result: creep.harvest(mineral), target: sourcePos }
        : { range: 0, result: creep.harvest(source), target: sourcePos };
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
    } else if (outcome?.result === ERR_TIRED) {
      // Extractor is on cooldown, ignore
      return { ...outcome, result: OK } as TaskActionResult;
    }

    // If the target is no longer claimed, we're done
    if (!creep.AssignedRoom.ClaimedMinePositions.some(p => SerializeRoomPosition(p) === this.miningPosition.pos)) {
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

    // If someone (other than a Miner or Maintainer or us) is in our spot, we're done
    const occupier = target.lookFor(LOOK_CREEPS).pop();
    if (
      occupier !== undefined &&
      occupier.id !== creep.id &&
      // occupier.memory.role !== 'Miner' &&
      occupier.memory.role !== 'Maintainer'
    ) {
      this.isCompleteFlag = true;
      return outcome;
    }

    // Otherwise, if we're a miner, mine forever
    if (creep.role?.groupName === 'Miners') {
      this.isCompleteFlag = false;
      return outcome;
    }

    if (source === null) return outcome;

    const mineral: Mineral | undefined = source.pos.lookFor(LOOK_MINERALS)[0];
    if (!mineral && source instanceof StructureExtractor) {
      this.isCompleteFlag = true;
      Logger.crit('Assigned extractor has no mineral beneath it.', {
        '<creep>': creep,
        extractor: source,
        pos: source.pos,
      });
      return null;
    }

    // For all others, we're done when we run out of free space,
    // or the source/mineral runs out of energy
    if (
      (source instanceof Source && source.energy === 0) ||
      (source instanceof StructureExtractor && mineral.mineralAmount === 0)
    ) {
      this.isCompleteFlag = true;
      return outcome;
    }

    this.isCompleteFlag = creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
    return outcome;
  }
}
