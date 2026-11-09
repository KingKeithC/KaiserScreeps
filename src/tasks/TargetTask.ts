/* eslint-disable @typescript-eslint/no-unused-vars */
import { CreepExtra } from 'Creep';
import { CreepTask, Targetable, TaskActionResult, TaskBase } from 'tasks/types';
import { DeserializeRoomPosition, RoomPositionString, SerializeRoomPosition } from 'utils/Collections';
import { Logger } from 'utils/Logger';

export abstract class TargetTask<Target extends Targetable> extends TaskBase implements CreepTask {
  public targetId: Id<Target>;
  public targetPos: string;
  public movementRange: number | undefined;
  public isCompleteFlag = false;
  // Engine range of the intent; the creep must be this close before it registers the intent.
  protected static readonly minRangeToAct: number = 3;
  // Body part the intent consumes; a creep without an active one cannot continue.
  protected static readonly requiredBodyPart: BodyPartConstant | undefined = undefined;

  // With a preferred position the task is pinned to it and `range` is ignored.
  public constructor(
    target: Target,
    range = TargetTask.minRangeToAct,
    preferredPosition?: RoomPosition | RoomPositionString,
  ) {
    super();
    this.targetId = target.id;

    if (preferredPosition === undefined) {
      this.movementRange = range;
      this.targetPos = SerializeRoomPosition(target.pos);
    } else {
      const position =
        typeof preferredPosition === 'string' ? DeserializeRoomPosition(preferredPosition) : preferredPosition;
      this.targetPos = SerializeRoomPosition(position);
      this.movementRange = 0;

      const actualRange = target.pos.getRangeTo(position);
      const minRangeToAct = (this.constructor as typeof TargetTask).minRangeToAct;
      if (actualRange > minRangeToAct)
        Logger.crit('Preferred target position is outside the task movement range.', {
          target,
          targetPosition: target.pos,
          allowedRange: minRangeToAct,
          preferredPosition: position,
          actualRange,
        });
    }
  }

  get range(): number {
    return this.movementRange ?? (this.constructor as typeof TargetTask).minRangeToAct;
  }

  protected movementResult(
    result: number,
    target?: Targetable,
    range = this.range,
    movementPosition?: RoomPosition,
  ): TaskActionResult {
    const pos = movementPosition ?? (target && range > 0 ? target.pos : DeserializeRoomPosition(this.targetPos));
    return { target: { pos }, range, result };
  }

  protected stationaryResult(
    result: number,
    target?: Targetable,
    range = this.range,
    movementPosition?: RoomPosition,
  ): TaskActionResult {
    const pos = movementPosition ?? (target && range > 0 ? target.pos : DeserializeRoomPosition(this.targetPos));
    if (result === ERR_NOT_IN_RANGE) {
      Logger.debug('Stationary result: not in range.', { target: target?.id, pos, range });
      result = OK;
    }
    return { target: { pos }, range, result };
  }

  // Convenent accessor to target
  get target(): Target | null {
    return Game.getObjectById(this.targetId);
  }

  protected isInActionRange(creep: CreepExtra, target: Targetable): boolean {
    const range = (this.constructor as typeof TargetTask).minRangeToAct;
    return creep.pos.roomName === target.pos.roomName && creep.pos.inRangeTo(target.pos, range);
  }

  // Engine call for this task; reached only when in range and not blocked.
  protected abstract registerIntent(creep: CreepExtra, target: NonNullable<Target>): number;

  actWhenTargetInvalid(_creep: CreepExtra, _targetRoom: Room): TaskActionResult | null {
    return null;
  }

  actWhenTargetInNonVisibleRoom(_creep: CreepExtra, targetPos: RoomPosition): TaskActionResult | null {
    return this.movementResult(ERR_NOT_IN_RANGE, undefined, 23, targetPos);
  }

  public act(creep: CreepExtra): TaskActionResult | null {
    const targetPos = DeserializeRoomPosition(this.targetPos);
    if (this.target === null || this.target === undefined)
      if (targetPos.roomName in Game.rooms)
        return this.actWhenTargetInvalid(creep, Game.rooms[targetPos.roomName]); // The target is in a visible room, and still can't see it, it must be invalid.
      else return this.actWhenTargetInNonVisibleRoom(creep, targetPos); // The target is in a non-visible room, it could be invalid or we might just need to move into the room.

    const target = this.target;
    if (!target) return null;
    if (!this.canContinue(creep)) return null;
    if (!this.isInActionRange(creep, target)) return this.movementResult(ERR_NOT_IN_RANGE, target);
    if (this.isIntentBlocked(creep, target)) return null;
    return this.movementResult(this.registerIntent(creep, target), target);
  }

  protected get completeWhenTargetIsNullAndInVisibleRoom() {
    return true;
  }
  protected get completeWhenTargetInNonVisibleRoom() {
    return false;
  }

  abstract isCreepAbleToContinue(creep: CreepExtra): boolean;
  abstract isCompleteWhenTargetValid(creep: CreepExtra, target: NonNullable<Target>): boolean;
  // Flags when this tick's intent is known to fail; the task then waits without registering it.
  protected abstract isIntentBlocked(creep: CreepExtra, target: NonNullable<Target>): boolean;

  public handleOutcome(creep: CreepExtra, result: TaskActionResult | null): TaskActionResult | null {
    this.handleTargetCompletion(creep);
    return this.handleOutcomeExtra(creep, result);
  }

  // Body parts never return once lost, so a missing required part ends the task.
  private canContinue(creep: CreepExtra): boolean {
    const requiredPart = (this.constructor as typeof TargetTask).requiredBodyPart;
    if (requiredPart !== undefined && creep.getActiveBodyparts(requiredPart) === 0) return false;
    return this.isCreepAbleToContinue(creep);
  }

  private handleTargetCompletion(creep: CreepExtra): void {
    // If creep can't continue, then we're done
    if (!this.canContinue(creep)) {
      this.isCompleteFlag = true;
      return;
    }

    // Check if we're in a different room than the target
    const targetPos = DeserializeRoomPosition(this.targetPos);
    if (targetPos.roomName !== creep.pos.roomName)
      if (!(targetPos.roomName in Game.rooms)) {
        this.isCompleteFlag = this.completeWhenTargetInNonVisibleRoom;
        // TODO: Invoke move logic early before bothering to act?
        return;
      }

    // We're in the same room as the target

    if (this.target === null || this.target === undefined) {
      if (targetPos.roomName in Game.rooms) {
        this.isCompleteFlag = this.completeWhenTargetIsNullAndInVisibleRoom;
        return;
      } else {
        Logger.warn('Target is null in a room that is not visible.', { '<creep>': creep, targetPos });
        this.isCompleteFlag = true;
        return;
      }
    }

    this.isCompleteFlag = this.isCompleteWhenTargetValid(creep, this.target);
  }

  // Override for task-specific result handling; the shared completion logic always runs first.
  protected handleOutcomeExtra(creep: CreepExtra, result: TaskActionResult | null): TaskActionResult | null {
    return result;
  }

  abstract extraToString?(target: NonNullable<Target>): string;
  protected toStringDetails(): string {
    let extra = '';
    if (this.target !== null && this.extraToString !== undefined) extra = '(' + this.extraToString(this.target) + ')';
    return `on ${this.target ? String(this.target) : `[id ${this.targetId} @ ${this.targetPos}]`}${extra}`;
  }
}
