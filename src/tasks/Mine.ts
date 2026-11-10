import { CreepExtra } from 'Creep';
import type { RoomExtra } from 'Room';
import { RegisterTask } from 'tasks/types';
import { DeserializeRoomPosition, RoomPositionString } from 'utils/Collections';
import { Logger } from 'utils/Logger';
import { isEqualTo, MiningPosition } from 'utils/RoomUtils';
import { PreferredPositionTask } from './PreferredPositionTask';

export class Mine extends PreferredPositionTask<Source | StructureExtractor> {
  static readonly action = '⛏️' as const;

  static {
    RegisterTask(this);
  }

  protected static override readonly minRangeToAct = 1;
  protected static override readonly requiredBodyPart = WORK;

  /** A mining spot for an idle miner: an unassigned source first, otherwise any unfilled position. */
  public static forMiner(room: RoomExtra, excluding?: CreepExtra): Mine | null {
    const available = room.AvailableMiningSources(excluding);
    if (available.length > 0) {
      const pos = available.pop();
      if (pos) return new Mine(pos.source, pos.pos);
    }

    const unfilled = room.UnfilledMiningPositions();
    if (unfilled.length > 0) {
      const pos = unfilled.pop();
      if (pos) return new Mine(pos.source, pos.pos);
    }

    return null;
  }

  /** Any unfilled mining position, for creeps with spare capacity. */
  public static anyUnfilled(room: RoomExtra, candidates = room.UnfilledMiningPositions()): Mine | null {
    return Mine.firstResolved(candidates.reverse());
  }

  // Skips positions whose source no longer exists.
  private static firstResolved(positions: MiningPosition[]): Mine | null {
    for (const mp of positions) {
      const source = Game.getObjectById(mp.source);
      if (source) return new Mine(source, mp.pos);
    }
    return null;
  }

  public constructor(
    source: Source | StructureExtractor | Id<Source> | Id<StructureExtractor>,
    position: RoomPositionString,
  ) {
    super(source, position);
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

  // Miners harvest only from their assigned tile, so they must be on it, not just in range.
  protected override isInActionRange(creep: CreepExtra, source: Source | StructureExtractor): boolean {
    if (creep.role?.groupName === 'Miners' && !creep.IsInAssignedMiningPosition()) return false;
    return super.isInActionRange(creep, source);
  }

  protected isIntentBlocked(creep: CreepExtra, source: Source | StructureExtractor): boolean {
    // For energy sources, block if the creep is full or the source is empty,
    // unless the creep is a Miner.
    if (creep.role?.groupName !== 'Miners') {
      if (creep.store.getFreeCapacity() === 0) return true;
      if (source instanceof Source) return source.energy === 0;
    }

    // Minerals work the same, without the exception for Miners.
    if (source instanceof StructureExtractor) {
      if (creep.store.getFreeCapacity() === 0) return true;
      const mineral = Mine.mineralAt(source);
      return mineral === undefined || mineral.mineralAmount === 0 || source.cooldown > 0;
    }

    return false;
  }

  protected registerIntent(creep: CreepExtra, source: Source | StructureExtractor): ScreepsReturnCode {
    const harvestable = source instanceof Source ? source : Mine.mineralAt(source);
    if (harvestable === undefined) return ERR_INVALID_TARGET;
    const result = creep.harvest(harvestable);
    return result === ERR_NOT_OWNER ? ERR_NOT_IN_RANGE : result; // Owner errors are forwarded as a move.
  }

  private static mineralAt(extractor: StructureExtractor): Mineral | undefined {
    return extractor.pos.lookFor(LOOK_MINERALS)[0];
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

    if (source instanceof StructureExtractor && mineral.mineralAmount === 0) {
      // Force mines to refresh, to clear empty saved extractors
      creep.AssignedRoom.memory.mines = undefined;
      return true;
    }
    if (creep.role?.groupName === 'Miners') return false;

    const miningPosition = this.miningPosition;
    if (miningPosition.pos !== undefined) {
      const position = DeserializeRoomPosition(miningPosition.pos);
      const occupier = position.lookFor(LOOK_CREEPS).pop();
      if (occupier !== undefined && occupier.id !== creep.id) return true;
    }

    return (source instanceof Source && source.energy === 0) || creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
  }
}
