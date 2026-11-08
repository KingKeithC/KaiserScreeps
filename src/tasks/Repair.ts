import { CreepExtra } from 'Creep';
import { RegisterTask, TaskActionResult } from 'tasks/types';
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
    inProgress: Repair[] = [...creep.AssignedRoom.AssignedTasks(Repair)],
  ): Repair | null {
    const repairersByTarget = new Map<string, number>();
    for (const task of inProgress) {
      repairersByTarget.set(task.targetId, (repairersByTarget.get(task.targetId) ?? 0) + 1);
    }

    const available = group.repairs.filter(s => (repairersByTarget.get(s.id) ?? 0) < group.maxWorkers);
    const target = ClosestByPath(creep, available);
    return target ? new Repair(target) : null;
  }

  public constructor(target: AnyStructure) {
    super(target);
  }

  public extraToString(target: AnyStructure): string {
    return `%${((target.hits / target.hitsMax) * 100).toFixed(2)}`;
  }

  public actWhenTargetValid(creep: CreepExtra, target: NonNullable<AnyStructure>): TaskActionResult | null {
    return this.movementResult(creep.repair(target), target);
  }

  public isCreepAbleToContinue(creep: CreepExtra): boolean {
    return creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0;
  }

  public isCompleteWhenTargetValid(creep: CreepExtra, target: NonNullable<AnyStructure>): boolean {
    return target.hits >= target.hitsMax;
  }
}
