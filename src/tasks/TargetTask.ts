import { CreepExtra } from 'Creep';
import { CreepTask, Targetable, TaskActionResult, TaskBase } from 'tasks/types';
import { DeserializeRoomPosition, RoomPositionString, SerializeRoomPosition } from 'utils/Collections';
import { Logger } from 'utils/Logger';

export abstract class TargetTask<Target extends Targetable> extends TaskBase implements CreepTask {
  public targetId: Id<Target>;
  public targetPos: string;
  public movementRange: number | undefined;
  public isCompleteFlag = false;
  protected static readonly minRangeToAct: number = 3;

  public constructor(target: Target, range?: number);
  public constructor(target: Id<Target>, range?: number);
  public constructor(target: Target | Id<Target>, range: 0, preferredPosition: RoomPosition | RoomPositionString);
  public constructor(
    targetOrId: Target | Id<Target>,
    range = TargetTask.minRangeToAct,
    preferredPosition?: RoomPosition | RoomPositionString,
  ) {
    super();
    this.targetId = typeof targetOrId === 'string' ? targetOrId : targetOrId.id;
    const target = typeof targetOrId === 'string' ? Game.getObjectById(this.targetId) : targetOrId;

    if (preferredPosition === undefined) {
      if (!target) throw new Error('A target ID requires a preferred position when the target is unresolved.');
      this.movementRange = range;
      this.targetPos = SerializeRoomPosition(target.pos);
    } else {
      if (range !== 0) throw new Error('A preferred position requires a movement range of 0.');
      const position =
        typeof preferredPosition === 'string' ? DeserializeRoomPosition(preferredPosition) : preferredPosition;
      this.targetPos = SerializeRoomPosition(position);
      this.movementRange = 0;

      if (!target) return;
      const actualRange = target.pos.getRangeTo(position);
      const minRangeToAct = (this.constructor as typeof TargetTask).minRangeToAct;
      if (actualRange > minRangeToAct)
        Logger.crit('Preferred target position is outside the task movement range.', {
          target: targetOrId,
          targetPosition: target.pos,
          allowedRange: minRangeToAct,
          preferredPosition: position,
          actualRange,
        });
    }
  }

  protected movementResult(
    result: number,
    target?: Targetable,
    range = this.movementRange ?? (this.constructor as typeof TargetTask).minRangeToAct,
    movementPosition?: RoomPosition,
  ): TaskActionResult {
    const pos = movementPosition ?? (target && range > 0 ? target.pos : DeserializeRoomPosition(this.targetPos));
    return { target: { pos }, range, result };
  }

  // Convenent accessor to target
  get target(): Target | null {
    return Game.getObjectById(this.targetId);
  }

  abstract actWhenTargetValid(creep: CreepExtra, target: NonNullable<Target>): TaskActionResult | null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  actWhenTargetInvalid(_creep: CreepExtra, _targetRoom: Room): TaskActionResult | null {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  actWhenTargetInNonVisibleRoom(_creep: CreepExtra, targetPos: RoomPosition): TaskActionResult | null {
    return this.movementResult(ERR_NOT_IN_RANGE, undefined, 23, targetPos);
  }

  public act(creep: CreepExtra): TaskActionResult | null {
    const targetPos = DeserializeRoomPosition(this.targetPos);
    if (this.target === null || this.target === undefined)
      if (targetPos.roomName in Game.rooms)
        return this.actWhenTargetInvalid(creep, Game.rooms[targetPos.roomName]); // The target is in a visible room, and still can't see it, it must be invalid.
      else return this.actWhenTargetInNonVisibleRoom(creep, targetPos); // The target is in a non-visible room, it could be invalid or we might just need to move into the room.

    return this.actWhenTargetValid(creep, this.target);
  }

  CompleteWhenTargetIsNullAndInVisibleRoom = true;
  CompleteWhenTargetInNonVisibleRoom = false;
  abstract isCreepAbleToContinue(creep: CreepExtra): boolean;
  abstract isCompleteWhenTargetValid(creep: CreepExtra, target: NonNullable<Target>): boolean;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public handleOutcome(creep: CreepExtra, result: TaskActionResult | null): TaskActionResult | null {
    // If creep can't continue, then we're done
    if (!this.isCreepAbleToContinue(creep)) {
      this.isCompleteFlag = true;
      return result;
    }

    // Check if we're in a different room than the target
    const targetPos = DeserializeRoomPosition(this.targetPos);
    if (targetPos.roomName !== creep.pos.roomName)
      if (!(targetPos.roomName in Game.rooms)) {
        this.isCompleteFlag = this.CompleteWhenTargetInNonVisibleRoom;
        // TODO: Invoke move logic early before bothering to act?
        return result;
      }

    // We're in the same room as the target

    if (this.target === null || this.target === undefined) {
      if (targetPos.roomName in Game.rooms) {
        this.isCompleteFlag = this.CompleteWhenTargetIsNullAndInVisibleRoom;
        return result;
      } else {
        Logger.warn('Target is null in a room that is not visible.', { '<creep>': creep, targetPos });
        this.isCompleteFlag = true;
        return result;
      }
    }

    this.isCompleteFlag = this.isCompleteWhenTargetValid(creep, this.target);
    return result;
  }

  abstract extraToString?(target: NonNullable<Target>): string;
  protected toStringDetails(): string {
    let extra = '';
    if (this.target !== null && this.extraToString !== undefined) extra = '(' + this.extraToString(this.target) + ')';
    return `on ${this.target ? String(this.target) : `[id ${this.targetId} @ ${this.targetPos}]`}${extra}`;
  }
}
