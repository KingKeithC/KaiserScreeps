import { CreepExtra } from 'Creep';
import { Filters } from 'utils/Collections';
import { RegisterTask, TaskActionResult } from 'tasks/types';
import { TargetTask } from './TargetTask';

export class UpgradeController extends TargetTask<StructureController> {
  static readonly action = '🔼' as const;

  static {
    RegisterTask(this);
  }

  static readonly DowngradeMaintenanceRatio = 1 / 4; // Start repairs when ticksToDowngrade drop below this.
  static readonly MaintenanceBuffer = 2000;
  private readonly startingProgress: number = 0;

  public constructor(
    controller: StructureController,
    public readonly mode: 'upgrade' | 'maintain',
  ) {
    super(controller);
    this.startingProgress = controller.progress;
  }

  ExpectedFinalProgress(controller: StructureController): number {
    return Math.min(this.startingProgress + UpgradeController.MaintenanceBuffer, controller.progressTotal);
  }

  public extraToString(target: StructureController): string {
    return `${this.mode} ${target.level} %${((target.progress / target.progressTotal) * 100).toExponential(2)}`;
  }

  public actWhenTargetValid(creep: CreepExtra, target: StructureController): TaskActionResult | null {
    return this.movementResult(creep.upgradeController(target), target);
  }

  isCreepAbleToContinue(creep: CreepExtra): boolean {
    if (creep.store.energy === 0) return false;
    // If we are in upgrade mode, and the creep is a maintainer,
    // and spawns need energy, end early
    if (
      this.mode === 'upgrade' &&
      Filters.CreepRoleName('Maintainer')(creep) &&
      creep.AssignedRoom.energyAvailable < creep.AssignedRoom.energyCapacityAvailable
    )
      return false;
    return true;
  }

  isCompleteWhenTargetValid(creep: CreepExtra, target: StructureController): boolean {
    return this.mode === 'maintain' && target.progress >= this.ExpectedFinalProgress(target);
  }

  protected override handleOutcomeExtra(creep: CreepExtra, results: TaskActionResult | null): TaskActionResult | null {
    if (results?.result === ERR_NOT_ENOUGH_RESOURCES) this.isCompleteFlag = true;
    if (results?.result === ERR_NOT_OWNER) this.isCompleteFlag = true;
    if (results?.result === ERR_INVALID_TARGET) this.isCompleteFlag = true;
    if (results?.result === ERR_INVALID_ARGS) this.isCompleteFlag = true;
    if (this.isCompleteFlag) return { ...results, result: OK } as TaskActionResult;
    return results;
  }
}
