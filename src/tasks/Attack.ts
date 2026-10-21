import type { CreepExtra } from "Creep";
import { TaskAction } from "./TaskAction";
import { BaseTask } from "./BaseTask";
import { CreepTask, TaskActionResult } from "./types";

export class AttackTargetTask extends BaseTask<typeof TaskAction.Attack> implements CreepTask<string> {
  public readonly kind = "attack" as const;

  public constructor(public readonly targetId: Id<Creep>) { super(TaskAction.Attack); }

  public toString(): string { return `${this.action} ${this.targetId}`; }

  public override isComplete(creep: CreepExtra): boolean {
    const target = Game.getObjectById(this.targetId);
    if (!target || !(target instanceof Creep)) return true;
    return false;
  }

  public override act(creep: CreepExtra): TaskActionResult | null {
    const target = Game.getObjectById(this.targetId);
    if (!target || !(target instanceof Creep)) return null;

    return { range: 1, result: creep.attack(target), target };
  }
}
