import { CreepExtra } from 'Creep';
import { TargetTask } from './TargetTask';
import { TaskAction } from './TaskAction';
import { TaskActionResult } from './types';

export class Dismantle extends TargetTask<typeof TaskAction.Dismantle, Id<AnyStructure>> {
  public readonly kind = 'dismantle' as const;

  public constructor(target: Id<AnyStructure>) {
    super(TaskAction.Dismantle, target, 'structure');
  }

  public override act(creep: CreepExtra): TaskActionResult | null {
    const target = Game.getObjectById(this.target);
    if (!target) return null;
    return { range: 1, result: creep.dismantle(target), target };
  }

  public override isComplete(): boolean {
    const target = Game.getObjectById(this.target);
    return !target;
  }
}
