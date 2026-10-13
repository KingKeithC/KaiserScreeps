import type { CreepExtra } from "Creep";
import { TaskAction } from "./TaskAction";
import { BaseTask } from "./BaseTask";

export interface UpdateControllerOptions {
    mode?: "upgrade" | "maintain";
}

export class UpdateController extends BaseTask<typeof TaskAction.MaintainController | typeof TaskAction.UpgradeController> {
    static readonly MaintenanceThreshold = 3500;
    static readonly MaintenanceBuffer = 2000;

    public readonly kind = "updateController" as const;
    public readonly mode: "upgrade" | "maintain";

    public constructor(public readonly controllerId?: Id<StructureController>, options: UpdateControllerOptions = {}) {
        const mode = options.mode ?? "upgrade";
        super(mode === "maintain" ? TaskAction.MaintainController : TaskAction.UpgradeController);
        this.mode = mode;
    }

    public toString(): string {
        const controller = this.controllerId ? Game.getObjectById(this.controllerId) : null;
        const target = controller ? String(controller) : this.controllerId ? `[controller ${this.controllerId}]` : "[room controller]";
        return `${this.action} on ${target}`;
    }

    public override act(creep: CreepExtra) {
        const target = this.controllerId
            ? Game.getObjectById(this.controllerId)
            : creep.room.controller;
        return this.perform(target instanceof StructureController ? target : null, 3, controller => creep.upgradeController(controller));
    }

    public override isComplete(creep: CreepExtra): boolean {
        const target = this.controllerId ? Game.getObjectById(this.controllerId) : creep.room.controller;
        if (!(target instanceof StructureController)) return true;
        if (creep.store.energy === 0) return true;
        return this.mode === "maintain"
            && target.ticksToDowngrade > UpdateController.MaintenanceThreshold + UpdateController.MaintenanceBuffer;
    }
}

export class MaintainController extends UpdateController {
    public constructor(controllerId?: Id<StructureController>) {
        super(controllerId, { mode: "maintain" });
    }
}
