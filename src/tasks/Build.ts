import type { CreepExtra } from "Creep";
import { TargetTask } from "./TargetTask";
import { TaskAction } from "./TaskAction";

export class Build extends TargetTask<typeof TaskAction.Build, Id<ConstructionSite<BuildableStructureConstant>>> {
  public readonly kind = "build" as const;

  public constructor(target: Id<ConstructionSite<BuildableStructureConstant>>) { super(TaskAction.Build, target, "construction site"); }

  public override act(creep: CreepExtra) {
    const target = Game.getObjectById(this.target);
    return this.perform(target instanceof ConstructionSite ? target : null, 3, site => creep.build(site));
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.store.energy === 0) return true;
    const target = this.resolveTarget();
    return !(target instanceof ConstructionSite) || target.progress === target.progressTotal;
  }
}
