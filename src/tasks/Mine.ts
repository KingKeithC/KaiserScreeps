import { CreepExtra } from 'Creep';
import { RegisterTask, TaskActionResult } from 'tasks/types';
import { DeserializeRoomPosition, RoomPositionString } from 'utils/Collections';
import { Logger } from 'utils/Logger';
import { isEqualTo, MiningPosition } from 'utils/RoomUtils';
import { TargetTask } from './TargetTask';

export class Mine extends TargetTask<Source | StructureExtractor> {
  static readonly action = '⛏️' as const;

  static {
    RegisterTask(this);
  }

  protected static override readonly minRangeToAct = 1;

  public constructor(source: Id<Source> | Id<StructureExtractor>, position?: RoomPositionString) {
    if (position === undefined) {
      const target = Game.getObjectById(source);
      if (!target) throw new Error('Mine requires a preferred position when its source is unresolved.');
      super(target, 1);
    } else super(source, 0, position);
  }

  public get miningPosition(): MiningPosition {
    return { source: this.targetId as MiningPosition['source'], pos: this.targetPos };
  }

  public extraToString(source: Source | StructureExtractor): string {
    const position = this.miningPosition.pos ? ` @ ${this.miningPosition.pos}` : '';
    if (source instanceof Source) return `${position} ${((source.energy / source.energyCapacity) * 100).toFixed(2)}`;
    const mineral = source.pos.lookFor(LOOK_MINERALS)[0];
    if (!mineral) return position;
    const max = MINERAL_DENSITY[mineral.density];
    const amount = ((mineral.mineralAmount / max) * 100).toFixed(2);
    return `${position} Amount: %${amount} Density: ${mineral.density} Cooldown: ${source.cooldown}`;
  }

  public actWhenTargetValid(creep: CreepExtra, source: Source | StructureExtractor): TaskActionResult | null {
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

    const result = source instanceof StructureExtractor ? creep.harvest(mineral) : creep.harvest(source);
    return this.movementResult(result === ERR_NOT_OWNER ? ERR_NOT_IN_RANGE : result, source);
  }

  public isCreepAbleToContinue(creep: CreepExtra): boolean {
    return creep.AssignedRoom.WorkableClaimedMiningPositions.some(amp =>
      amp[1].some(mp => isEqualTo(mp, this.miningPosition)),
    );
  }

  public isCompleteWhenTargetValid(creep: CreepExtra, source: Source | StructureExtractor): boolean {
    const mineral: Mineral | undefined = source.pos.lookFor(LOOK_MINERALS)[0];
    if (!mineral && source instanceof StructureExtractor) {
      this.isCompleteFlag = true;
      Logger.crit('Assigned extractor has no mineral beneath it.', {
        '<creep>': creep,
        extractor: source,
        pos: source.pos,
      });
      return true;
    }

    if (source instanceof StructureExtractor && mineral.mineralAmount === 0) return true;
    if (creep.role?.groupName === 'Miners') return false;

    const miningPosition = this.miningPosition;
    if (miningPosition.pos !== undefined) {
      const position = DeserializeRoomPosition(miningPosition.pos);
      const occupier = position.lookFor(LOOK_CREEPS).pop();
      if (occupier !== undefined && occupier.id !== creep.id) return true;
    }

    return (source instanceof Source && source.energy === 0) || creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
  }

  protected override handleOutcomeExtra(creep: CreepExtra, outcome: TaskActionResult | null): TaskActionResult | null {
    // If the source is out of energy, and we're not a miner, then we're done
    if (outcome && outcome.result === ERR_NOT_ENOUGH_RESOURCES) {
      // Force mines to refresh, to clear empty saved extractors
      if (this.target && this.target instanceof StructureExtractor) creep.AssignedRoom.memory.mines = undefined;

      // Mark task as complete if we are not a miner
      if (creep.role.groupName !== 'Miners') this.isCompleteFlag = true;
    }

    // Otherwise, check if we're in our mining position, and return out of range if not
    if (outcome && creep.role?.groupName === 'Miners' && !creep.IsInAssignedMiningPosition())
      outcome.result = ERR_NOT_IN_RANGE;

    return outcome;
  }
}
