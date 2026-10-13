import type { CreepExtra } from "Creep";
import { TaskAction } from "./TaskAction";
import { TargetTask } from "./BaseTask";

export class Supply extends TargetTask<typeof TaskAction.Supply, Id<AnyStoreStructure>> {
  public readonly kind = "supply" as const;

  public constructor(target: Id<AnyStoreStructure>) { super(TaskAction.Supply, target, "structure"); }

  public override act(creep: CreepExtra) {
    const target = Game.getObjectById(this.target);
    return this.perform(target && "store" in target ? target as AnyStoreStructure : null, 1, structure => creep.transfer(structure, RESOURCE_ENERGY));
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.energy === 0) return true;
    const target = this.resolveTarget();
    return !target || !("store" in target)
      || (target as AnyStoreStructure).store.getFreeCapacity(RESOURCE_ENERGY) === 0;
  }
}
