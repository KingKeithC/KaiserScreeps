import { CreepExtra } from 'Creep';
import { TaskAction, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class UpgradeController extends TargetTask<typeof TaskAction.UpgradeController, StructureController> {
  static readonly DowngradeMaintenanceRatio = 1 / 4; // Start repairs when ticksToDowngrade drop below this.
  static readonly MaintenanceBuffer = 2000;

  public readonly kind = 'updateController' as const;
  private readonly startingProgress: number = 0;

  public constructor(
    controller: StructureController,
    public readonly mode: 'upgrade' | 'maintain',
  ) {
    super(TaskAction.UpgradeController, controller);
    this.startingProgress = controller.progress;
  }

  ExpectedFinalProgress(controller: StructureController): number {
    return Math.min(this.startingProgress + UpgradeController.MaintenanceBuffer, controller.progressTotal);
  }

  public extraToString(target: StructureController): string {
    return `${this.mode} ${target.level} %${((target.progress / target.progressTotal) * 100).toExponential(2)}`;
  }

  public actWhenTargetValid(creep: CreepExtra, target: StructureController): TaskActionResult | null {
    return { range: 3, result: creep.upgradeController(target), target };
  }

  isCreepAbleToContinue(creep: CreepExtra): boolean {
    if (creep.store.energy === 0) return false;
    return true;
  }

  isCompleteWhenTargetValid(creep: CreepExtra, target: StructureController): boolean {
    return this.mode === 'maintain' && target.progress >= this.ExpectedFinalProgress(target);
  }

  public handleOutcome(): void {
    return;
  }
}
