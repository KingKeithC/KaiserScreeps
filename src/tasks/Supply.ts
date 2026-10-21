import { CreepExtra } from "Creep";
import { TargetTask } from "./TargetTask";
import { TaskAction } from "./TaskAction";
import { TaskActionResult } from "./types";

export class Supply extends TargetTask<typeof TaskAction.Supply, Id<AnyStoreStructure>> {
  public readonly kind = "supply" as const;

  public constructor(target: Id<AnyStoreStructure>) { super(TaskAction.Supply, target, "structure"); }

  public override act(creep: CreepExtra): TaskActionResult | null {
    const target = Game.getObjectById(this.target);
    if (!target) return null;
    return { range: 1, result: creep.transfer(target, RESOURCE_ENERGY), target };
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.energy === 0) return true;
    const target = this.resolveTarget();
    return !target || !("store" in target)
      || (target as AnyStoreStructure).store.getFreeCapacity(RESOURCE_ENERGY) === 0;
  }
}
