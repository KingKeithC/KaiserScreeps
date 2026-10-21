import type { CreepExtra } from "Creep";
import { TaskAction } from "./TaskAction";
import { BaseTask } from "./BaseTask";
import { CreepTask } from "./types";

export class AttackTargetTask extends BaseTask<typeof TaskAction.Attack> implements CreepTask<string> {
  public readonly kind = "attack" as const;

  public constructor(public readonly targetId: Id<Creep>) { super(TaskAction.Attack); }

  public toString(): string { return `${this.action} ${this.targetId}`; }

  public override isComplete(creep: CreepExtra): boolean {
    const target = Game.getObjectById(this.targetId);
    return !(target instanceof Creep) || !creep.room.find(FIND_HOSTILE_CREEPS).some(hostile => hostile.id === target.id);
  }
}
