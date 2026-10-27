import { CreepExtra } from 'Creep';
import { DeserializeRoomPosition, SerializeRoomPosition } from 'utils/Collections';
import { BaseTask } from './BaseTask';
import { TaskActionResult } from './types';

export type Targetable = _HasId & _HasRoomPosition;

export abstract class TargetTask<Action extends string, Target extends Targetable> extends BaseTask<Action> {
  public readonly targetId: Id<Target>;
  public readonly targetPos: string;

  public constructor(action: Action, target: Target) {
    super(action);
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
      else if (!(targetPos.roomName in Game.rooms))
        return this.actWhenTargetInNonVisibleRoom(creep, targetPos); // The target is in a non-visible room, it could be invalid or we might just need to move into the room.
      else throw new Error('Target is null, and in room that is neither visible nor invisible...');

    return this.actWhenTargetValid(creep, this.target);
  }

  isCompleteWhenTargetInvalid = true;
  isCompleteWhenTargetInNonVisibleRoom = false;
  abstract isCreepAbleToContinue(creep: CreepExtra): boolean;
  abstract isCompleteWhenTargetValid(creep: CreepExtra, target: NonNullable<Target>): boolean;
  public isComplete(creep: CreepExtra): boolean {
    if (!this.isCreepAbleToContinue(creep)) return false;

    const targetPos = DeserializeRoomPosition(this.targetPos);
    if (this.target === null || this.target === undefined)
      if (targetPos.roomName in Game.rooms) return this.isCompleteWhenTargetInvalid;
      else if (!(targetPos.roomName in Game.rooms)) return this.isCompleteWhenTargetInNonVisibleRoom;
      else throw new Error('Target is null, and in room that is neither visible nor invisible...');

    return this.isCompleteWhenTargetValid(creep, this.target);
  }

  abstract extraToString?(target: NonNullable<Target>): string;
  public toString(): string {
    let extra = '';
    if (this.target !== null && this.extraToString !== undefined) extra = '(' + this.extraToString(this.target) + ')';
    return `${this.action} on ${this.target ? String(this.target) : `[id ${this.targetId} @ ${this.targetPos}]`}${extra}`;
  }
}
