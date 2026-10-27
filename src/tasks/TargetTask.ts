import { SerializeRoomPosition } from 'utils/Collections';
import { BaseTask } from './BaseTask';

export abstract class TargetTask<
  Action extends string,
  Target extends _HasId & _HasRoomPosition,
> extends BaseTask<Action> {
  public readonly targetId: Id<Target>;
  public readonly targetPos: string;

  public constructor(action: Action, target: Target) {
    super(action);
    this.targetId = target.id;
    this.targetPos = SerializeRoomPosition(target.pos);
  }

  get target(): Target | null {
    return Game.getObjectById(this.targetId);
  }

  abstract extraToString?(): string;

  public toString(): string {
    const target = Game.getObjectById(this.targetId);
    const extra = this.extraToString ? '(' + this.extraToString() + ')' : '';
    return `${this.action} on ${target ? String(target) : `[id ${this.targetId} @ ${this.targetPos}]`}${extra}`;
  }
}
