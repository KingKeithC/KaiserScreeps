/* eslint-disable max-classes-per-file */
import { CreepExtra } from "Creep";
import { BaseTask } from "./BaseTask";
import { TaskAction } from "./TaskAction";

export interface UpdateControllerOptions {
  mode?: "upgrade" | "maintain";
}

export class UpdateController extends BaseTask<typeof TaskAction.MaintainController | typeof TaskAction.UpgradeController> {
  static readonly DowngradeMaintenanceRatio = 1 / 4; // Start repairs when ticksToDowngrade drop below this.
  static readonly MaintenanceBuffer = 2000;

  public readonly kind = "updateController" as const;
  public readonly mode: "upgrade" | "maintain";
  public readonly startingProgress: number = 0;

  ExpectedFinalProgress(controller: StructureController): number {
    return Math.min(this.startingProgress + UpdateController.MaintenanceBuffer, controller.progressTotal);
  }

  public readonly controllerId: Id<StructureController>;

  public constructor(public readonly controller: StructureController, options: UpdateControllerOptions = {}) {
    const mode = options.mode ?? "upgrade";
    super(mode === "maintain" ? TaskAction.MaintainController : TaskAction.UpgradeController);
    this.mode = mode;
    this.controllerId = controller.id;
    this.startingProgress = controller.progress;
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
    const controller = Game.getObjectById(this.controllerId);
    if (!(controller instanceof StructureController)) return true;
    if (creep.store.energy === 0) return true;
    return this.mode === "maintain" && controller.progress >= this.ExpectedFinalProgress(controller);
  }
}

export class MaintainController extends UpdateController {
  public constructor(controller: StructureController) {
    super(controller, { mode: "maintain" });
  }
}
