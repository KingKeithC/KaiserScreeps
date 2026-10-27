import { CreepExtra } from 'Creep';
import { DeserializeRoomPosition, SerializeRoomPosition } from 'utils/Collections';
import { BaseTask } from './BaseTask';
import { TaskAction } from './TaskAction';
import { TaskActionResult } from './types';

export class Move extends BaseTask<typeof TaskAction.Move> {
  public readonly kind = 'move' as const;

  public readonly targetPos: string;

  public constructor(
    targetPos: RoomPosition | { pos: RoomPosition },
    public readonly minDistance: number = 5,
  ) {
    super(TaskAction.Move);
    this.targetPos = SerializeRoomPosition('pos' in targetPos ? targetPos.pos : targetPos);
  }

  public toRoomPosition(): RoomPosition {
    return DeserializeRoomPosition(this.targetPos);
  }

  public toString(): string {
    return `${this.action} on ${this.toRoomPosition()} (minDistance: ${this.minDistance})`;
  }

  public override act(): TaskActionResult | null {
    return { range: this.minDistance, result: ERR_NOT_IN_RANGE, target: { pos: this.toRoomPosition() } };
  }

  public override isComplete(creep: CreepExtra): boolean {
    if (creep.room.name !== this.toRoomPosition().roomName) return false;
    return creep.pos.inRangeTo(this.toRoomPosition(), this.minDistance);
  }
}
