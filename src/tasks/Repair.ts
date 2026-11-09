import { CreepExtra } from 'Creep';
import { RegisterTask } from 'tasks/types';
import { ClosestByPath } from 'utils/CreepUtils';
import type { RepairPrioritySelection } from 'utils/RepairUtils';
import { TargetTask } from './TargetTask';

export class Repair extends TargetTask<AnyStructure> {
  static readonly action = '🛠️' as const;

  static {
    RegisterTask(this);
  }

  /**
   * The closest structure in `group` that has fewer than `maxWorkers` repairers already assigned.
   */
  public static nearestInGroup(
    creep: CreepExtra,
    group: RepairPrioritySelection,
    inProgress: Repair[] = [...creep.AssignedRoom.AssignedTasks(Repair, creep)],
  ): Repair | null {
    const repairersByTarget = new Map<string, number>();
    for (const task of inProgress) {
      repairersByTarget.set(task.targetId, (repairersByTarget.get(task.targetId) ?? 0) + 1);
    }

    const available = group.repairs.filter(s => (repairersByTarget.get(s.id) ?? 0) < group.maxWorkers);
    const target = ClosestByPath(creep, available);
    return target ? new Repair(target) : null;
  }

  protected static override readonly requiredBodyPart = WORK;

  public constructor(target: AnyStructure) {
    super(target);
  }

  public extraToString(target: AnyStructure): string {
    return `%${((target.hits / target.hitsMax) * 100).toFixed(2)}`;
  }

  protected registerIntent(creep: CreepExtra, target: NonNullable<AnyStructure>): ScreepsReturnCode {
    return creep.repair(target);
  }

  protected isIntentBlocked(): boolean {
    return false;
  }

  public isCreepAbleToContinue(creep: CreepExtra): boolean {
    return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
  }

  public isCompleteWhenTargetValid(creep: CreepExtra, target: NonNullable<AnyStructure>): boolean {
    return target.hits >= target.hitsMax;
  }
}
