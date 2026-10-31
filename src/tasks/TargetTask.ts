import { CreepExtra } from 'Creep';
import { CreepTask, TaskActionResult } from 'tasks/types';
import { DeserializeRoomPosition, SerializeRoomPosition } from 'utils/Collections';
import { Logger } from 'utils/Logger';

export type Targetable = _HasId & _HasRoomPosition;

export abstract class TargetTask<Action extends string, Target extends Targetable> implements CreepTask<Action> {
  public readonly targetId: Id<Target>;
  public readonly targetPos: string;
  public isCompleteFlag = false;

  public constructor(
    public readonly action: Action,
    target: Target,
  ) {
    this.targetId = target.id;
    this.targetPos = SerializeRoomPosition(target.pos);
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

  actWhenTargetInNonVisibleRoom(_creep: CreepExtra, targetPos: RoomPosition): TaskActionResult | null {
    // Return a move instruction to the target's room
    return { range: 15, result: ERR_NOT_IN_RANGE, target: { pos: targetPos } };
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
      if (targetPos.roomName in Game.rooms) {
        this.isCompleteFlag = this.CompleteWhenTargetIsNullAndInVisibleRoom;
        return result;
      } else {
        this.isCompleteFlag = this.CompleteWhenTargetInNonVisibleRoom;
        // TODO: Invoke move logic early before bothering to act?
        return result;
      }

    // We're in the same room as the target

    if (this.target === null || this.target === undefined) {
      Logger.warn('Target is null, and in room that is neither visible nor invisible...');
      this.isCompleteFlag = true;
      return result;
    }

    this.isCompleteFlag = this.isCompleteWhenTargetValid(creep, this.target);
    return result;
  }

  abstract extraToString?(target: NonNullable<Target>): string;
  public toString(): string {
    let extra = '';
    if (this.target !== null && this.extraToString !== undefined) extra = '(' + this.extraToString(this.target) + ')';
    return `${this.action} on ${this.target ? String(this.target) : `[id ${this.targetId} @ ${this.targetPos}]`}${extra}`;
  }
}
