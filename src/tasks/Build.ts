import type { CreepExtra } from 'Creep';
import { RegisterTask } from 'tasks/types';
import { Filters, Sorts } from 'utils/Collections';
import { ClosestByPath } from 'utils/CreepUtils';
import { TargetTask } from './TargetTask';

export class Build extends TargetTask<ConstructionSite<BuildableStructureConstant>> {
  static readonly action = '🏗️' as const;

  static {
    RegisterTask(this);
  }

  // Highest priority first; within a priority, the closest site in our room, then the most finished remote one.
  static readonly ConstructionPriorities: ((c: ConstructionSite) => boolean)[] = [
    Filters.ConstructionRampartOrWall,
    Filters.ConstructionType(STRUCTURE_SPAWN),
    Filters.ConstructionType(STRUCTURE_EXTENSION),
    Filters.ConstructionType(STRUCTURE_ROAD),
    () => true, // Everything else
  ];

  /** The site to build next for `creep`, or null when there are no candidates. */
  public static nearestPriority(
    creep: CreepExtra,
    candidates: ConstructionSite[] = creep.AssignedRoom.ConstructionSites,
  ): Build | null {
    for (const p of Build.ConstructionPriorities) {
      const group = candidates.filter(p);
      if (group.length === 0) continue;

      const inRoom = ClosestByPath(
        creep,
        group.filter(s => s.pos.roomName === creep.room.name),
      );
      if (inRoom) return new Build(inRoom);

      const remote = group
        .filter(s => s.pos.roomName !== creep.room.name)
        .sort(Sorts.ConstructionProgressRatioAsc)
        .pop();
      if (remote) return new Build(remote);
    }
    return null;
  }

  protected static override readonly requiredBodyPart = WORK;

  public constructor(target: ConstructionSite<BuildableStructureConstant>) {
    super(target);
  }

  extraToString(target: ConstructionSite<BuildableStructureConstant>): string {
    const progress = (target.progress / target.progressTotal) * 100;
    return `%${progress.toExponential(2)}`;
  }

  protected registerIntent(creep: CreepExtra, target: ConstructionSite<BuildableStructureConstant>): ScreepsReturnCode {
    return creep.build(target);
  }

  protected isIntentBlocked(): boolean {
    return false;
  }

  public isCreepAbleToContinue(creep: CreepExtra): boolean {
    return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
  }

  public isCompleteWhenTargetValid(creep: CreepExtra, target: ConstructionSite<BuildableStructureConstant>): boolean {
    return target.progress >= target.progressTotal;
  }
}
