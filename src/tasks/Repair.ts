import type { CreepExtra } from "Creep";
import { TaskAction } from "./TaskAction";
import { TargetTask } from "./BaseTask";

export class Repair extends TargetTask<typeof TaskAction.Repair, Id<AnyStructure>> {
    public readonly kind = "repair" as const;

    public constructor(target: Id<AnyStructure>) { super(TaskAction.Repair, target, "structure"); }

    public override act(creep: CreepExtra) {
        const target = Game.getObjectById(this.target);
        return this.perform(target instanceof Structure ? target : null, 3, structure => creep.repair(structure as AnyOwnedStructure));
    }

    public override isComplete(creep: CreepExtra): boolean {
        if (creep.store.energy === 0) return true;
        const target = this.resolveTarget();
        return !(target instanceof Structure) || target.hits === target.hitsMax;
    }
}
