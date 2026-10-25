import type { CreepExtra } from 'Creep';
import { TaskAction } from './TaskAction';
import { CreepTask, TaskActionResult } from './types';
import { TargetTask } from './TargetTask';

export class Attack extends TargetTask<typeof TaskAction.Attack, Id<Creep>> implements CreepTask<string> {
  public readonly kind = 'attack' as const;

  public constructor(creep: Creep) {
    super(TaskAction.Attack, creep.id, 'creep');
  }

  public override isComplete(): boolean {
    const target = Game.getObjectById(this.target);
    if (!target || !(target instanceof Creep)) return true;
    return false;
  }

  public override act(creep: CreepExtra): TaskActionResult | null {
    const target = Game.getObjectById(this.target);
    if (!target || !(target instanceof Creep)) return null;
    return { range: 1, result: creep.attack(target), target };
  }
}
