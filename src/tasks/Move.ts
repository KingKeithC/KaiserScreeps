import { CreepExtra } from 'Creep';
import { TargetTask } from './TargetTask';
import { TaskAction } from './TaskAction';
import { TaskActionResult } from './types';

export class Move extends TargetTask<typeof TaskAction.Move, RoomPosition> {
  public readonly kind = 'move' as const;

  public constructor(
    public readonly targetPos: RoomPosition,
    public minDistance: number = 5,
  ) {
    super(TaskAction.Move, targetPos, 'roomPosition');
  }

  public toString(): string {
    return `${this.action} on ${this.GetTargetPosition()} (minDistance: ${this.minDistance})`;
  }

  private GetTargetPosition(): RoomPosition {
    return new RoomPosition(this.targetPos.x, this.targetPos.y, this.targetPos.roomName);
  }

  public override act(): TaskActionResult | null {
    const target = this.GetTargetPosition();
    return { range: this.minDistance, result: ERR_NOT_IN_RANGE, target: { pos: target } };
  }

  public override isComplete(creep: CreepExtra): boolean {
    const target = this.GetTargetPosition();
    if (creep.room.name !== target.roomName) return false;
    return creep.pos.inRangeTo(target, this.minDistance);
  }
}
