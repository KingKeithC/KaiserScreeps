import { CreepExtra } from 'Creep';
import { CreepTask, RegisterTask, TaskActionResult, TaskBase } from 'tasks/types';
import { DeserializeRoomPosition, SerializeRoomPosition } from 'utils/Collections';

export class Move extends TaskBase implements CreepTask {
  static readonly action = '👣' as const;
  public isCompleteFlag = false;

  static {
    RegisterTask(this);
  }

  public readonly targetPos: string;

  public constructor(
    targetPos: RoomPosition | { pos: RoomPosition },
    public readonly minDistance: number = 5,
  ) {
    super();
    this.targetPos = SerializeRoomPosition('pos' in targetPos ? targetPos.pos : targetPos);
  }

  public toRoomPosition(): RoomPosition {
    return DeserializeRoomPosition(this.targetPos);
  }

  protected toStringDetails(): string {
    return `on ${this.toRoomPosition()} (minDistance: ${this.minDistance})`;
  }

  public act(): TaskActionResult | null {
    return { range: this.minDistance, result: ERR_NOT_IN_RANGE, target: { pos: this.toRoomPosition() } };
  }

  public handleOutcome(creep: CreepExtra, outcome: TaskActionResult | null): TaskActionResult | null {
    // Not done, so don't update isCompleteFlag
    if (creep.room.name !== this.toRoomPosition().roomName) return outcome;

    // Update flag based on range to target
    this.isCompleteFlag = creep.pos.inRangeTo(this.toRoomPosition(), this.minDistance);
    return outcome;
  }
}
