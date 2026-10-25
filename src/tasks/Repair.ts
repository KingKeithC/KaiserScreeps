import { CreepExtra } from 'Creep';
import { TargetTask } from './TargetTask';
import { TaskAction } from './TaskAction';
import { TaskActionResult } from './types';

export class Repair extends TargetTask<typeof TaskAction.Repair, Id<AnyStructure>> {
  public readonly kind = 'repair' as const;

  public repairRoom: string;

  public constructor(target: AnyStructure) {
    super(TaskAction.Repair, target.id, 'structure');
    this.repairRoom = target.pos.roomName;
  }

  public override act(creep: CreepExtra): TaskActionResult | null {
    const target = Game.getObjectById(this.target);

    if (!target) return null;
    return { range: 1, result: creep.repair(target), target };
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.energy === 0) return true;
    const target = this.resolveTarget();
    return !(target instanceof Structure) || target.hits === target.hitsMax;
  }
}
