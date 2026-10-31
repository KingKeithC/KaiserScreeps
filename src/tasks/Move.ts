import { CreepExtra } from 'Creep';
import { CreepTask, TaskAction, TaskActionResult } from 'tasks/types';
import { DeserializeRoomPosition, SerializeRoomPosition } from 'utils/Collections';

export class Move implements CreepTask {
  public readonly action = TaskAction.Move;
  public readonly kind = 'move' as const;
  public isCompleteFlag = false;

  public readonly targetPos: string;

  public constructor(
    targetPos: RoomPosition | { pos: RoomPosition },
    public readonly minDistance: number = 5,
  ) {
    this.targetPos = SerializeRoomPosition('pos' in targetPos ? targetPos.pos : targetPos);
  }

  public toRoomPosition(): RoomPosition {
    return DeserializeRoomPosition(this.targetPos);
  }

  public toString(): string {
    return `${this.action} on ${this.toRoomPosition()} (minDistance: ${this.minDistance})`;
  }

  public act(): TaskActionResult | null {
    return { range: this.minDistance, result: ERR_NOT_IN_RANGE, target: { pos: this.toRoomPosition() } };
  }

  public handleOutcome(creep: CreepExtra): void {
    // Not done, so don't update isCompleteFlag
    if (creep.room.name !== this.toRoomPosition().roomName) return;

    // Update flag based on range to target
    this.isCompleteFlag = creep.pos.inRangeTo(this.toRoomPosition(), this.minDistance);
  }
}
