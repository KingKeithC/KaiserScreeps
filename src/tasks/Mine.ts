import type { CreepExtra } from "Creep";
import { TaskAction } from "./TaskAction";
import { TargetTask } from "./BaseTask";

export class Mine extends TargetTask<typeof TaskAction.Mine, Id<Source>> {
    public readonly kind = "mine" as const;

    public constructor(target: Id<Source>) { super(TaskAction.Mine, target, "source"); }

    public override act(creep: CreepExtra) {
        const target = Game.getObjectById(this.target);
        return this.perform(target instanceof Source ? target : null, 1, source => creep.harvest(source));
    }

    public override isComplete(creep: CreepExtra): boolean {
        const isAMiner = creep.role?.groupName === "Miners";
        if (isAMiner) return false;

        if (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0)
            return true;

        if (creep.pos.findInRange(FIND_MY_CREEPS, 4, { filter: c => c.memory.role.startsWith("Miner") }).length > 0)
            return true;

        const source = this.resolveTarget();
        return !(source instanceof Source) || source.energy === 0;
    }
}
