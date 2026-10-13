import type { CreepExtra } from "Creep";
import { TaskAction } from "./TaskAction";
import { BaseTask } from "./BaseTask";

export class AttackTargetTask extends BaseTask<typeof TaskAction.Attack> {
  public readonly kind = "attack" as const;

  public constructor(public readonly targetId: Id<Creep>) { super(TaskAction.Attack); }

  public toString(): string { return `${this.action} ${this.targetId}`; }

  public override isComplete(creep: CreepExtra): boolean {
    const target = Game.getObjectById(this.targetId);
    return !(target instanceof Creep) || !creep.room.find(FIND_HOSTILE_CREEPS).some(hostile => hostile.id === target.id);
  }
}
