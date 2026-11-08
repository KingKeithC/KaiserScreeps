import { CreepExtra } from 'Creep';
import type { RoomExtra } from 'Room';
import { RegisterTask } from 'tasks/types';
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
  protected static override readonly requiredBodyPart = WORK;

  /** A mining spot for an idle miner: an unassigned source first, otherwise any unfilled position. */
  public static forMiner(room: RoomExtra): Mine | null {
    for (const mp of room.AvailableMiningSources()) return new Mine(mp.source, mp.pos);
    for (const mp of room.UnfilledMiningPositions()) return new Mine(mp.source, mp.pos);
    return null;
  }

  /** Any unfilled mining position, for creeps with spare capacity. */
  public static anyUnfilled(room: RoomExtra): Mine | null {
    const mp = room.UnfilledMiningPositions().pop();
    if (mp) return new Mine(mp.source, mp.pos);
    return null;
  }

  public constructor(source: Id<Source> | Id<StructureExtractor>, position?: RoomPositionString) {
    super(source, 1, position);
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
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;
    if (source instanceof Source) return source.energy === 0;
    const mineral = Mine.mineralAt(source);
    return mineral === undefined || mineral.mineralAmount === 0 || source.cooldown > 0;
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
