import type { CreepExtra } from 'Creep';
import { TargetTask } from './TargetTask';
import { TaskAction } from './TaskAction';
import { TaskActionResult } from './types';

export class Build extends TargetTask<typeof TaskAction.Build, Id<ConstructionSite<BuildableStructureConstant>>> {
  public readonly kind = 'build' as const;

  public constructor(target: Id<ConstructionSite<BuildableStructureConstant>>) {
    super(TaskAction.Build, target, 'construction site');
  }

  public override act(creep: CreepExtra): TaskActionResult | null {
    const target = Game.getObjectById(this.target);
    if (target !== null) return { range: 3, result: creep.build(target), target };
    return null;
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.energy === 0) return true;
    const target = this.resolveTarget();
    return !(target instanceof ConstructionSite) || target.progress === target.progressTotal;
  }
}
