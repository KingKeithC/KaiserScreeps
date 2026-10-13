import type { CreepExtra } from "Creep";
import { TaskAction } from "./TaskAction";
import { TargetTask } from "./BaseTask";

export class Pickup extends TargetTask<typeof TaskAction.Pickup, Id<Resource<RESOURCE_ENERGY>>> {
  public readonly kind = "pickup" as const;

  public constructor(target: Id<Resource<RESOURCE_ENERGY>>) { super(TaskAction.Pickup, target, "resource"); }

  public override act(creep: CreepExtra) {
    const target = Game.getObjectById(this.target);
    return this.perform(target instanceof Resource ? target : null, 0, resource => creep.pickup(resource));
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;
    const target = this.resolveTarget();
    return !(target instanceof Resource) || target.amount === 0;
  }
}
